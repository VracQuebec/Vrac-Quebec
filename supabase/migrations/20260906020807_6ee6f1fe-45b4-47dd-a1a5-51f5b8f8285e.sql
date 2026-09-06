
-- Suggestions fournisseurs + transporteurs (prompt 13)
CREATE OR REPLACE FUNCTION public.mkt_deal_suggest(_request_id uuid, _material text DEFAULT NULL, _quantity numeric DEFAULT NULL, _unit text DEFAULT 'tonne')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; qty numeric; mat text; suppliers jsonb; carriers jsonb;
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'acces refuse'; END IF;
  SELECT * INTO r FROM public.mkt_quote_requests WHERE id = _request_id;
  qty := coalesce(_quantity, nullif((r.answers->>'quantite'),'')::numeric, 0);
  mat := coalesce(_material, nullif(r.answers->>'materiau',''), r.title);

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'unit_price')::numeric), '[]'::jsonb) INTO suppliers FROM (
    SELECT jsonb_build_object(
      'supply_price_id', sp.id,
      'company_id', sp.company_id,
      'company_name', coalesce(p.trade_name, p.legal_name, 'Entreprise'),
      'material_label', sp.material_label,
      'unit', sp.unit,
      'unit_price', sp.price,
      'min_fee', sp.min_fee,
      'surcharge_percent', sp.surcharge_percent,
      'pickup_city', sp.pickup_city,
      'distance_km', CASE WHEN r.latitude IS NOT NULL AND sp.latitude IS NOT NULL
          THEN round(public._haversine_km(r.latitude, r.longitude, sp.latitude, sp.longitude)::numeric, 1) END,
      'material_cost', round(greatest(sp.min_fee, sp.price * qty) * (1 + sp.surcharge_percent/100.0), 2)
    ) AS x
    FROM public.mkt_supply_prices sp
    LEFT JOIN public.mkt_partners p ON p.company_id = sp.company_id
    WHERE sp.is_active
      AND (sp.valid_from IS NULL OR sp.valid_from <= current_date)
      AND (sp.valid_until IS NULL OR sp.valid_until >= current_date)
      AND (mat IS NULL OR sp.material_label ILIKE '%'||mat||'%' OR mat ILIKE '%'||sp.material_label||'%')
    LIMIT 25
  ) s;

  SELECT coalesce(jsonb_agg(y ORDER BY (y->>'transport_cost')::numeric), '[]'::jsonb) INTO carriers FROM (
    SELECT jsonb_build_object(
      'transport_rate_id', tr.id,
      'company_id', tr.company_id,
      'company_name', coalesce(p.trade_name, p.legal_name, 'Transporteur'),
      'truck_type', tr.truck_type,
      'price_model', tr.price_model,
      'price', tr.price,
      'price_per_km', tr.price_per_km,
      'min_fee', tr.min_fee,
      'capacity_tonnes', tr.capacity_tonnes,
      'trips', CASE WHEN coalesce(tr.capacity_tonnes,0) > 0 AND qty > 0 THEN ceil(qty / tr.capacity_tonnes) ELSE NULL END,
      'distance_km', CASE WHEN r.latitude IS NOT NULL AND tr.latitude IS NOT NULL
          THEN round(public._haversine_km(r.latitude, r.longitude, tr.latitude, tr.longitude)::numeric, 1) END,
      'transport_cost', round(greatest(tr.min_fee,
          CASE tr.price_model
            WHEN 'tonne' THEN tr.price * qty
            WHEN 'verge' THEN tr.price * qty
            WHEN 'voyage' THEN tr.price * CASE WHEN coalesce(tr.capacity_tonnes,0) > 0 AND qty > 0 THEN ceil(qty / tr.capacity_tonnes) ELSE 1 END
            WHEN 'km' THEN tr.price_per_km * coalesce(CASE WHEN r.latitude IS NOT NULL AND tr.latitude IS NOT NULL
                 THEN public._haversine_km(r.latitude, r.longitude, tr.latitude, tr.longitude) END, 0)
            ELSE tr.price END
        ) * (1 + tr.surcharge_percent/100.0), 2)
    ) AS y
    FROM public.mkt_transport_rates tr
    LEFT JOIN public.mkt_partners p ON p.company_id = tr.company_id
    WHERE tr.is_active
      AND (tr.valid_from IS NULL OR tr.valid_from <= current_date)
      AND (tr.valid_until IS NULL OR tr.valid_until >= current_date)
    LIMIT 25
  ) c;

  RETURN jsonb_build_object('request_id', _request_id, 'material', mat, 'quantity', qty, 'unit', _unit,
    'suppliers', suppliers, 'carriers', carriers);
END $$;
REVOKE ALL ON FUNCTION public.mkt_deal_suggest(uuid, text, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_deal_suggest(uuid, text, numeric, text) TO authenticated, service_role;

-- Notifications (prompt 16)
CREATE OR REPLACE FUNCTION public.mkt_notify(_audience text, _event text, _title text, _body text DEFAULT NULL,
  _user_id uuid DEFAULT NULL, _company_id uuid DEFAULT NULL, _request_id uuid DEFAULT NULL, _link text DEFAULT NULL, _level text DEFAULT 'info')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; prefs record; chans text[] := array['app'];
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT * INTO prefs FROM public.mkt_notification_prefs WHERE user_id = _user_id;
    IF FOUND THEN
      IF _event = ANY(prefs.muted_events) THEN RETURN NULL; END IF;
      chans := array[]::text[];
      IF prefs.app_enabled THEN chans := chans || 'app'; END IF;
      IF prefs.email_enabled THEN chans := chans || 'email'; END IF;
      IF prefs.sms_enabled THEN chans := chans || 'sms'; END IF;
    END IF;
  END IF;
  INSERT INTO public.mkt_notifications (user_id, company_id, audience, event, title, body, level, request_id, link, channels)
  VALUES (_user_id, _company_id, _audience, _event, _title, _body, _level, _request_id, _link, chans)
  RETURNING id INTO nid;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public.mkt_notify(text,text,text,text,uuid,uuid,uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_notify(text,text,text,text,uuid,uuid,uuid,text,text) TO authenticated, service_role;

-- Scores partenaires (prompt 15)
CREATE OR REPLACE FUNCTION public.mkt_recompute_scores()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; n integer := 0;
  v_inv int; v_bids int; v_aw int; v_done int; v_can int; v_dis int; v_resp numeric; v_hours numeric;
  v_profile numeric; v_score numeric; v_last timestamptz;
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'acces refuse'; END IF;
  FOR c IN SELECT * FROM public.mkt_partners WHERE is_active LOOP
    SELECT count(*), count(*) FILTER (WHERE responded_at IS NOT NULL),
           avg(extract(epoch FROM (responded_at - sent_at))/3600.0), max(greatest(sent_at, responded_at))
      INTO v_inv, v_bids, v_hours, v_last
      FROM public.mkt_invitations WHERE company_id = c.company_id;
    SELECT count(*) INTO v_bids FROM public.mkt_bids WHERE company_id = c.company_id AND status <> 'brouillon';
    SELECT count(*) FILTER (WHERE status <> 'annule'), count(*) FILTER (WHERE completed_at IS NOT NULL), count(*) FILTER (WHERE status = 'annule')
      INTO v_aw, v_done, v_can FROM public.mkt_awards WHERE company_id = c.company_id;
    v_dis := 0;
    v_resp := CASE WHEN coalesce(v_inv,0) > 0 THEN round(100.0 * v_bids / v_inv, 1) ELSE NULL END;
    v_profile := (
      (CASE WHEN c.description IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN c.logo_url IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN c.phone IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN c.email IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN c.city IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN c.neq IS NOT NULL THEN 10 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.mkt_partner_services s WHERE s.company_id = c.company_id AND s.is_active) THEN 20 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM public.mkt_partner_territories t WHERE t.company_id = c.company_id AND t.is_active) THEN 20 ELSE 0 END)
    );
    -- base neutre 70 pour une nouvelle entreprise sans historique
    v_score := 0.30 * v_profile
             + 0.15 * (CASE WHEN c.is_verified THEN 100 ELSE 40 END)
             + 0.25 * coalesce(v_resp, 70)
             + 0.20 * (CASE WHEN v_aw > 0 THEN least(100, 60 + 10 * v_done) ELSE 70 END)
             + 0.10 * (CASE WHEN v_can + v_dis = 0 THEN 100 ELSE greatest(0, 100 - 20 * (v_can + v_dis)) END);
    INSERT INTO public.mkt_partner_scores (company_id, internal_score, public_score, profile_completion, response_rate,
        avg_response_hours, invitations_count, bids_count, awards_count, completed_count, cancelled_count, disputes_count,
        last_activity_at, computed_at)
    VALUES (c.company_id, round(v_score,1), round(v_score,1), v_profile, v_resp, round(coalesce(v_hours,0)::numeric,1),
        coalesce(v_inv,0), coalesce(v_bids,0), coalesce(v_aw,0), coalesce(v_done,0), coalesce(v_can,0), v_dis, v_last, now())
    ON CONFLICT (company_id) DO UPDATE SET
      internal_score = excluded.internal_score,
      public_score = excluded.public_score,
      profile_completion = excluded.profile_completion,
      response_rate = excluded.response_rate,
      avg_response_hours = excluded.avg_response_hours,
      invitations_count = excluded.invitations_count,
      bids_count = excluded.bids_count,
      awards_count = excluded.awards_count,
      completed_count = excluded.completed_count,
      cancelled_count = excluded.cancelled_count,
      disputes_count = excluded.disputes_count,
      last_activity_at = excluded.last_activity_at,
      computed_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mkt_recompute_scores() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_recompute_scores() TO authenticated, service_role;

-- Analytique (prompt 18)
CREATE OR REPLACE FUNCTION public.mkt_analytics(_from timestamptz DEFAULT (now() - interval '30 days'), _to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb;
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'acces refuse'; END IF;
  SELECT jsonb_build_object(
    'periode', jsonb_build_object('du', _from, 'au', _to),
    'demandes', (SELECT count(*) FROM public.mkt_quote_requests WHERE created_at BETWEEN _from AND _to),
    'par_categorie', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(c.name,'Non classé'), 'n', t.n) ORDER BY t.n DESC), '[]'::jsonb)
        FROM (SELECT category_id, count(*) n FROM public.mkt_quote_requests WHERE created_at BETWEEN _from AND _to GROUP BY 1) t
        LEFT JOIN public.mkt_service_categories c ON c.id = t.category_id),
    'par_region', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(region,'Inconnue'), 'n', n) ORDER BY n DESC), '[]'::jsonb)
        FROM (SELECT region, count(*) n FROM public.mkt_quote_requests WHERE created_at BETWEEN _from AND _to GROUP BY 1) t),
    'par_ville', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(city,'Inconnue'), 'n', n) ORDER BY n DESC), '[]'::jsonb)
        FROM (SELECT city, count(*) n FROM public.mkt_quote_requests WHERE created_at BETWEEN _from AND _to GROUP BY 1 ORDER BY 2 DESC LIMIT 15) t),
    'par_type_client', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(client_type,'inconnu'), 'n', n) ORDER BY n DESC), '[]'::jsonb)
        FROM (SELECT client_type, count(*) n FROM public.mkt_quote_requests WHERE created_at BETWEEN _from AND _to GROUP BY 1) t),
    'conversion', jsonb_build_object(
      'distribuees', (SELECT count(DISTINCT request_id) FROM public.mkt_invitations WHERE created_at BETWEEN _from AND _to),
      'invitations', (SELECT count(*) FROM public.mkt_invitations WHERE created_at BETWEEN _from AND _to),
      'reponses', (SELECT count(*) FROM public.mkt_invitations WHERE created_at BETWEEN _from AND _to AND responded_at IS NOT NULL),
      'soumissions', (SELECT count(*) FROM public.mkt_bids WHERE created_at BETWEEN _from AND _to AND status <> 'brouillon'),
      'contrats', (SELECT count(*) FROM public.mkt_awards WHERE created_at BETWEEN _from AND _to)
    ),
    'financier', jsonb_build_object(
      'valeur_soumissions', (SELECT coalesce(sum(amount),0) FROM public.mkt_bids WHERE created_at BETWEEN _from AND _to AND status <> 'brouillon'),
      'valeur_contrats', (SELECT coalesce(sum(coalesce(final_amount, amount)),0) FROM public.mkt_awards WHERE created_at BETWEEN _from AND _to),
      'commissions', (SELECT coalesce(sum(amount),0) FROM public.mkt_commissions WHERE created_at BETWEEN _from AND _to),
      'revenu_par_categorie', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(c.name,'Non classé'), 'montant', t.m) ORDER BY t.m DESC), '[]'::jsonb)
          FROM (SELECT r.category_id, sum(cm.amount) m FROM public.mkt_commissions cm JOIN public.mkt_quote_requests r ON r.id = cm.request_id
                WHERE cm.created_at BETWEEN _from AND _to GROUP BY 1) t
          LEFT JOIN public.mkt_service_categories c ON c.id = t.category_id),
      'revenu_par_partenaire', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(p.trade_name, p.legal_name, 'Entreprise'), 'montant', t.m) ORDER BY t.m DESC), '[]'::jsonb)
          FROM (SELECT company_id, sum(amount) m FROM public.mkt_commissions WHERE created_at BETWEEN _from AND _to GROUP BY 1 ORDER BY 2 DESC LIMIT 15) t
          LEFT JOIN public.mkt_partners p ON p.company_id = t.company_id)
    ),
    'partenaires_actifs', (SELECT coalesce(jsonb_agg(jsonb_build_object('label', coalesce(p.trade_name, p.legal_name,'Entreprise'),
          'invitations', t.inv, 'soumissions', t.b) ORDER BY t.inv DESC), '[]'::jsonb)
        FROM (SELECT i.company_id, count(*) inv, count(*) FILTER (WHERE i.responded_at IS NOT NULL) b
              FROM public.mkt_invitations i WHERE i.created_at BETWEEN _from AND _to GROUP BY 1 ORDER BY 2 DESC LIMIT 15) t
        LEFT JOIN public.mkt_partners p ON p.company_id = t.company_id),
    'demandes_non_comblees', (SELECT coalesce(jsonb_agg(jsonb_build_object('numero', r.request_number, 'titre', r.title,
          'ville', r.city, 'categorie', c.name) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM public.mkt_quote_requests r LEFT JOIN public.mkt_service_categories c ON c.id = r.category_id
        WHERE r.created_at BETWEEN _from AND _to
          AND NOT EXISTS (SELECT 1 FROM public.mkt_bids b WHERE b.request_id = r.id AND b.status <> 'brouillon'))
  ) INTO res;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.mkt_analytics(timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_analytics(timestamptz, timestamptz) TO authenticated, service_role;

-- Automatisations (prompt 19)
CREATE OR REPLACE FUNCTION public.mkt_run_automations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rule record; r record; n int := 0; log jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.mkt_is_admin() THEN RAISE EXCEPTION 'acces refuse'; END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'sans_soumission' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT q.* FROM public.mkt_quote_requests q
      WHERE q.is_active AND q.created_at < now() - make_interval(hours => rule.delay_hours)
        AND EXISTS (SELECT 1 FROM public.mkt_invitations i WHERE i.request_id = q.id)
        AND NOT EXISTS (SELECT 1 FROM public.mkt_bids b WHERE b.request_id = q.id AND b.status <> 'brouillon')
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key = 'sans_soumission' AND ar.request_id = q.id
                        AND ar.created_at > now() - make_interval(hours => rule.delay_hours))
      LIMIT 50
    LOOP
      PERFORM public.mkt_notify('admin','aucune_soumission','Aucune soumission — '||coalesce(r.request_number,''),
        'La demande '||coalesce(r.title,'')||' n''a reçu aucune soumission.', NULL, NULL, r.id, '/admin/marche/soumissions', 'warning');
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, action, detail)
      VALUES ('sans_soumission', r.id, 'alerte_admin', jsonb_build_object('numero', r.request_number));
      n := n + 1;
    END LOOP;
  END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'invitation_sans_reponse' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT i.*, q.request_number FROM public.mkt_invitations i JOIN public.mkt_quote_requests q ON q.id = i.request_id
      WHERE i.responded_at IS NULL AND i.sent_at IS NOT NULL
        AND i.sent_at < now() - make_interval(hours => rule.delay_hours)
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key='invitation_sans_reponse'
              AND ar.detail->>'invitation_id' = i.id::text AND ar.created_at > now() - make_interval(hours => rule.delay_hours))
      LIMIT 100
    LOOP
      PERFORM public.mkt_notify('partenaire','rappel_invitation','Rappel — opportunité '||coalesce(r.request_number,''),
        'Une opportunité attend votre réponse.', NULL, r.company_id, r.request_id, '/partenaire/soumissions', 'info');
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action, detail)
      VALUES ('invitation_sans_reponse', r.request_id, r.company_id, 'rappel_partenaire', jsonb_build_object('invitation_id', r.id));
      n := n + 1;
    END LOOP;
  END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'soumission_expire' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT b.*, q.request_number FROM public.mkt_bids b JOIN public.mkt_quote_requests q ON q.id = b.request_id
      WHERE b.status = 'envoyee' AND b.valid_until IS NOT NULL
        AND b.valid_until <= (current_date + (rule.delay_hours || ' hours')::interval)
        AND b.valid_until >= current_date
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key='soumission_expire'
              AND ar.detail->>'bid_id' = b.id::text)
      LIMIT 100
    LOOP
      PERFORM public.mkt_notify('partenaire','soumission_expire','Soumission bientôt expirée — '||coalesce(r.request_number,''),
        'Votre soumission expire le '||to_char(r.valid_until,'YYYY-MM-DD')||'.', NULL, r.company_id, r.request_id, '/partenaire/soumissions', 'warning');
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action, detail)
      VALUES ('soumission_expire', r.request_id, r.company_id, 'notification', jsonb_build_object('bid_id', r.id));
      n := n + 1;
    END LOOP;
  END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'client_sans_decision' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT q.* FROM public.mkt_quote_requests q
      WHERE q.is_active
        AND (SELECT count(*) FROM public.mkt_bids b WHERE b.request_id = q.id AND b.status = 'envoyee') > 0
        AND NOT EXISTS (SELECT 1 FROM public.mkt_awards a WHERE a.request_id = q.id)
        AND q.updated_at < now() - make_interval(hours => rule.delay_hours)
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key='client_sans_decision' AND ar.request_id = q.id
              AND ar.created_at > now() - make_interval(hours => rule.delay_hours))
      LIMIT 50
    LOOP
      PERFORM public.mkt_notify('client','relance_client','Des soumissions attendent votre décision',
        'Vous avez reçu des soumissions pour '||coalesce(r.title,'votre demande')||'.', r.client_user_id, NULL, r.id, '/mes-soumissions', 'info');
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, action, detail)
      VALUES ('client_sans_decision', r.id, 'relance_client', '{}'::jsonb);
      n := n + 1;
    END LOOP;
  END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'attribution_confirmation' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT a.*, q.request_number, q.client_user_id FROM public.mkt_awards a JOIN public.mkt_quote_requests q ON q.id = a.request_id
      WHERE (a.client_confirmed_at IS NULL OR a.partner_confirmed_at IS NULL)
        AND a.awarded_at < now() - make_interval(hours => rule.delay_hours)
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key='attribution_confirmation'
              AND ar.detail->>'award_id' = a.id::text AND ar.created_at > now() - make_interval(hours => rule.delay_hours))
      LIMIT 50
    LOOP
      IF r.client_confirmed_at IS NULL THEN
        PERFORM public.mkt_notify('client','confirmation_attribution','Confirmez l''attribution '||coalesce(r.request_number,''),
          'Merci de confirmer le mandat retenu.', r.client_user_id, NULL, r.request_id, '/mes-soumissions', 'info');
      END IF;
      IF r.partner_confirmed_at IS NULL THEN
        PERFORM public.mkt_notify('partenaire','confirmation_attribution','Confirmez le contrat '||coalesce(r.request_number,''),
          'Merci de confirmer le contrat attribué.', NULL, r.company_id, r.request_id, '/partenaire/soumissions', 'info');
      END IF;
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action, detail)
      VALUES ('attribution_confirmation', r.request_id, r.company_id, 'confirmation', jsonb_build_object('award_id', r.id));
      n := n + 1;
    END LOOP;
  END IF;

  SELECT * INTO rule FROM public.mkt_automation_rules WHERE key = 'projet_termine' AND is_active;
  IF FOUND THEN
    FOR r IN SELECT a.*, q.request_number, q.client_user_id FROM public.mkt_awards a JOIN public.mkt_quote_requests q ON q.id = a.request_id
      WHERE a.completed_at IS NOT NULL AND a.completed_at < now() - make_interval(hours => rule.delay_hours)
        AND NOT EXISTS (SELECT 1 FROM public.mkt_automation_runs ar WHERE ar.rule_key='projet_termine' AND ar.detail->>'award_id' = a.id::text)
      LIMIT 50
    LOOP
      PERFORM public.mkt_compute_commission(r.id);
      PERFORM public.mkt_notify('client','evaluation','Évaluez le travail réalisé',
        'Votre avis aide les prochains clients.', r.client_user_id, NULL, r.request_id, '/mes-soumissions', 'info');
      PERFORM public.mkt_notify('admin','commission_a_facturer','Commission à facturer — '||coalesce(r.request_number,''),
        'Le projet est terminé, la commission peut être facturée.', NULL, NULL, r.request_id, '/admin/marche/commissions', 'info');
      INSERT INTO public.mkt_automation_runs (rule_key, request_id, company_id, action, detail)
      VALUES ('projet_termine', r.request_id, r.company_id, 'cloture', jsonb_build_object('award_id', r.id));
      n := n + 1;
    END LOOP;
  END IF;

  UPDATE public.mkt_automation_rules SET last_run_at = now() WHERE is_active;
  RETURN jsonb_build_object('actions', n, 'ran_at', now(), 'log', log);
END $$;
REVOKE ALL ON FUNCTION public.mkt_run_automations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mkt_run_automations() TO authenticated, service_role;

-- Annuaire public (prompt 17)
CREATE OR REPLACE FUNCTION public.mkt_directory(_service text DEFAULT NULL, _city text DEFAULT NULL, _region text DEFAULT NULL, _category_slug text DEFAULT NULL, _limit integer DEFAULT 60)
RETURNS TABLE (company_id uuid, name text, description text, logo_url text, city text, region text,
  services text[], territories text[], public_score numeric, is_verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.company_id,
         coalesce(p.trade_name, p.legal_name, 'Entreprise'),
         p.description, p.logo_url, p.city, p.region,
         coalesce(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), array[]::text[]),
         coalesce(array_agg(DISTINCT coalesce(t.city, t.region)) FILTER (WHERE coalesce(t.city, t.region) IS NOT NULL), array[]::text[]),
         CASE WHEN s.show_public_score THEN s.public_score END,
         p.is_verified
  FROM public.mkt_partners p
  LEFT JOIN public.mkt_partner_services ps ON ps.company_id = p.company_id AND ps.is_active
  LEFT JOIN public.mkt_service_categories c ON c.id = ps.category_id AND c.is_active
  LEFT JOIN public.mkt_partner_territories t ON t.company_id = p.company_id AND t.is_active
  LEFT JOIN public.mkt_partner_scores s ON s.company_id = p.company_id
  WHERE p.is_active AND p.is_public AND p.archived_at IS NULL
  GROUP BY p.company_id, p.trade_name, p.legal_name, p.description, p.logo_url, p.city, p.region, s.show_public_score, s.public_score, p.is_verified
  HAVING (_service IS NULL OR EXISTS (
            SELECT 1 FROM public.mkt_partner_services ps2 JOIN public.mkt_service_categories c2 ON c2.id = ps2.category_id
            WHERE ps2.company_id = p.company_id AND ps2.is_active AND c2.is_active
              AND (c2.name ILIKE '%'||_service||'%' OR coalesce(array_to_string(c2.keywords,' '),'') ILIKE '%'||_service||'%')))
     AND (_category_slug IS NULL OR EXISTS (
            SELECT 1 FROM public.mkt_partner_services ps3 JOIN public.mkt_service_categories c3 ON c3.id = ps3.category_id
            WHERE ps3.company_id = p.company_id AND ps3.is_active
              AND (c3.slug = _category_slug OR c3.parent_id IN (SELECT id FROM public.mkt_service_categories WHERE slug = _category_slug))))
     AND (_city IS NULL OR p.city ILIKE '%'||_city||'%' OR EXISTS (
            SELECT 1 FROM public.mkt_partner_territories t2 WHERE t2.company_id = p.company_id AND t2.is_active
              AND (t2.city ILIKE '%'||_city||'%' OR t2.scope = 'province')))
     AND (_region IS NULL OR p.region ILIKE '%'||_region||'%' OR EXISTS (
            SELECT 1 FROM public.mkt_partner_territories t3 WHERE t3.company_id = p.company_id AND t3.is_active
              AND (t3.region ILIKE '%'||_region||'%' OR t3.scope = 'province')))
  ORDER BY p.is_verified DESC, coalesce(s.public_score,0) DESC, 2
  LIMIT coalesce(_limit, 60);
$$;
REVOKE ALL ON FUNCTION public.mkt_directory(text,text,text,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.mkt_directory(text,text,text,text,integer) TO anon, authenticated, service_role;
