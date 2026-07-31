
CREATE OR REPLACE FUNCTION public.jsc_readiness(_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_steps jsonb := '[]'::jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_flow jsonb := '[]'::jsonb;
  v_done int := 0;
  v_total int := 0;
  v_score int;
  v_critical int;
  c_companies int; c_taxes int; c_zones int; c_suppliers int; c_pickups int;
  c_carriers int; c_trucks int; c_cats int; c_materials int; c_prices int; c_rates int;
  c_settings int;
  n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs.';
  END IF;

  SELECT value INTO v_mode FROM public.jsc_settings WHERE key = 'platform_mode' LIMIT 1;
  v_mode := COALESCE(NULLIF(v_mode, ''), 'test');

  SELECT count(*) INTO c_companies FROM public.jsc_companies WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_taxes FROM public.jsc_taxes WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_zones FROM public.jsc_zones WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_suppliers FROM public.jsc_suppliers WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_pickups FROM public.jsc_pickup_locations WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_carriers FROM public.jsc_companies WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_trucks FROM public.jsc_trucks WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_cats FROM public.jsc_material_categories WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_materials FROM public.jsc_materials WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_prices FROM public.jsc_material_prices WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_rates FROM public.jsc_transport_rates WHERE archived_at IS NULL AND is_active;
  SELECT count(*) INTO c_settings FROM public.jsc_settings s
    WHERE s.archived_at IS NULL AND s.is_active AND s.value IS NOT NULL AND s.value <> ''
      AND s.key IN ('time_rounding_minutes','price_rounding_decimals','margin_percent','fuel_surcharge_percent','min_trip_minutes');

  v_steps := jsonb_build_array(
    jsonb_build_object('id','company','resource','carriers','label','Informations de l''entreprise','count',c_companies,'min',1),
    jsonb_build_object('id','taxes','resource','taxes','label','Taxes','count',c_taxes,'min',1),
    jsonb_build_object('id','zones','resource','zones','label','Régions desservies','count',c_zones,'min',1),
    jsonb_build_object('id','suppliers','resource','suppliers','label','Fournisseurs','count',c_suppliers,'min',1),
    jsonb_build_object('id','pickups','resource','pickup_locations','label','Lieux de chargement','count',c_pickups,'min',1),
    jsonb_build_object('id','carriers','resource','carriers','label','Transporteurs','count',c_carriers,'min',1),
    jsonb_build_object('id','trucks','resource','trucks','label','Camions','count',c_trucks,'min',1),
    jsonb_build_object('id','categories','resource','material_categories','label','Catégories de matériaux','count',c_cats,'min',1),
    jsonb_build_object('id','materials','resource','materials','label','Matériaux','count',c_materials,'min',1),
    jsonb_build_object('id','prices','resource','material_prices','label','Tarification des matériaux','count',c_prices,'min',1),
    jsonb_build_object('id','rates','resource','transport_rates','label','Tarification du transport','count',c_rates,'min',1),
    jsonb_build_object('id','settings','resource','settings','label','Paramètres du moteur','count',c_settings,'min',5)
  );

  SELECT count(*) FILTER (WHERE (e->>'count')::int >= (e->>'min')::int), count(*)
    INTO v_done, v_total FROM jsonb_array_elements(v_steps) e;

  -- ---------- Validation automatique ----------
  SELECT count(*) INTO n FROM public.jsc_materials m
   WHERE m.archived_at IS NULL AND m.is_active
     AND NOT EXISTS (SELECT 1 FROM public.jsc_material_prices p
                     WHERE p.material_id = m.id AND p.archived_at IS NULL AND p.is_active)
     AND COALESCE(m.selling_price,0) <= 0;
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','material_without_price',
    'label','Matériaux sans prix','count',n,'detail','Ces matériaux ne peuvent pas être calculés ni vendus.','resource','material_prices'); END IF;

  SELECT count(*) INTO n FROM public.jsc_suppliers s
   WHERE s.archived_at IS NULL AND s.is_active
     AND NOT EXISTS (SELECT 1 FROM public.jsc_pickup_locations p
                     WHERE p.supplier_id = s.id AND p.archived_at IS NULL AND p.is_active);
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','supplier_without_pickup',
    'label','Fournisseurs sans lieu de chargement','count',n,'detail','Le moteur ne peut pas calculer de distance depuis ce fournisseur.','resource','pickup_locations'); END IF;

  SELECT count(*) INTO n FROM public.jsc_trucks t
   WHERE t.archived_at IS NULL AND t.is_active AND COALESCE(t.capacity_tonnes,0) <= 0;
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','truck_without_capacity',
    'label','Camions sans capacité','count',n,'detail','La capacité en tonnes est obligatoire pour calculer le nombre de voyages.','resource','trucks'); END IF;

  IF c_rates = 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','no_transport_rate',
    'label','Aucun tarif de transport','count',0,'detail','Aucun prix de transport ne peut être calculé.','resource','transport_rates'); END IF;

  IF c_taxes = 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','no_tax',
    'label','Aucune taxe configurée','count',0,'detail','TPS et TVQ doivent exister pour émettre des documents officiels.','resource','taxes'); END IF;

  IF c_settings < 5 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','engine_settings_missing',
    'label','Paramètres du moteur incomplets','count',5 - c_settings,'detail','Arrondis, marge, surcharge carburant et durée minimale sont requis.','resource','settings'); END IF;

  SELECT count(*) INTO n FROM public.jsc_zones z
   WHERE z.archived_at IS NULL AND z.is_active
     AND (z.center_lat IS NULL OR z.center_lng IS NULL OR COALESCE(z.radius_km,0) <= 0);
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','warning','code','zone_incomplete',
    'label','Régions incomplètes','count',n,'detail','Centre géographique ou rayon manquant.','resource','zones'); END IF;

  SELECT count(*) INTO n FROM public.jsc_pickup_locations p
   WHERE p.archived_at IS NULL AND p.is_active AND (p.latitude IS NULL OR p.longitude IS NULL);
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','pickup_without_coordinates',
    'label','Lieux de chargement sans coordonnées','count',n,'detail','Latitude et longitude sont requises pour la matrice de distances.','resource','pickup_locations'); END IF;

  SELECT count(*) INTO n FROM (
    SELECT lower(trim(name)) FROM public.jsc_materials WHERE archived_at IS NULL GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','warning','code','duplicate_materials',
    'label','Matériaux en double','count',n,'detail','Des matériaux portent le même nom.','resource','materials'); END IF;

  SELECT count(*) INTO n FROM (
    SELECT lower(trim(name)) FROM public.jsc_suppliers WHERE archived_at IS NULL GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','warning','code','duplicate_suppliers',
    'label','Fournisseurs en double','count',n,'detail','Des fournisseurs portent le même nom.','resource','suppliers'); END IF;

  SELECT count(*) INTO n FROM public.jsc_material_prices p
   WHERE p.archived_at IS NULL AND (
     NOT EXISTS (SELECT 1 FROM public.jsc_materials m WHERE m.id = p.material_id)
     OR (p.supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.jsc_suppliers s WHERE s.id = p.supplier_id))
     OR (p.pickup_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.jsc_pickup_locations l WHERE l.id = p.pickup_location_id)));
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','broken_price_links',
    'label','Relations cassées dans la tarification','count',n,'detail','Des prix pointent vers des enregistrements inexistants.','resource','material_prices'); END IF;

  SELECT count(*) INTO n FROM public.jsc_transport_rates r
   WHERE r.archived_at IS NULL AND r.is_active
     AND ((r.rate_mode = 'hourly' AND COALESCE(r.hourly_rate,0) <= 0)
       OR (r.rate_mode = 'per_km' AND COALESCE(r.rate_per_km,0) <= 0)
       OR (r.rate_mode = 'per_trip' AND COALESCE(r.rate_per_trip,0) <= 0)
       OR (r.rate_mode = 'flat' AND COALESCE(r.flat_rate,0) <= 0));
  IF n > 0 THEN v_issues := v_issues || jsonb_build_object('severity','critical','code','rate_without_amount',
    'label','Tarifs sans montant','count',n,'detail','Le montant du mode de tarification choisi est vide.','resource','transport_rates'); END IF;

  SELECT count(*) INTO v_critical FROM jsonb_array_elements(v_issues) i WHERE i->>'severity' = 'critical';

  -- ---------- Parcours client ----------
  v_flow := jsonb_build_array(
    jsonb_build_object('id','clients','label','Clients', 'count',(SELECT count(*) FROM public.jsc_clients WHERE archived_at IS NULL)),
    jsonb_build_object('id','requests','label','Demandes', 'count',(SELECT count(*) FROM public.jsc_requests WHERE archived_at IS NULL)),
    jsonb_build_object('id','estimates','label','Estimations', 'count',(SELECT count(*) FROM public.jsc_estimates)),
    jsonb_build_object('id','quotes','label','Soumissions', 'count',(SELECT count(*) FROM public.jsc_quotes WHERE archived_at IS NULL)),
    jsonb_build_object('id','orders','label','Commandes', 'count',(SELECT count(*) FROM public.jsc_orders WHERE archived_at IS NULL)),
    jsonb_build_object('id','deliveries','label','Livraisons', 'count',(SELECT count(*) FROM public.jsc_deliveries WHERE archived_at IS NULL)),
    jsonb_build_object('id','invoices','label','Factures', 'count',(SELECT count(*) FROM public.jsc_invoices WHERE archived_at IS NULL))
  );

  v_score := CASE WHEN v_total = 0 THEN 0 ELSE floor((v_done::numeric / v_total) * 100)::int END;

  RETURN jsonb_build_object(
    'mode', v_mode,
    'steps', v_steps,
    'steps_done', v_done,
    'steps_total', v_total,
    'score', v_score,
    'issues', v_issues,
    'critical_count', v_critical,
    'flow', v_flow,
    'production_ready', (v_done = v_total AND v_critical = 0),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.jsc_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsc_readiness(uuid) TO authenticated;

-- Garde-fou : liste des erreurs critiques bloquant tout calcul officiel.
CREATE OR REPLACE FUNCTION public.jsc_production_guard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  errs text[] := '{}';
  v_mode text;
BEGIN
  SELECT value INTO v_mode FROM public.jsc_settings WHERE key = 'platform_mode' LIMIT 1;
  v_mode := COALESCE(NULLIF(v_mode, ''), 'test');

  IF NOT EXISTS (SELECT 1 FROM public.jsc_transport_rates WHERE archived_at IS NULL AND is_active) THEN
    errs := errs || 'Aucun tarif de transport configuré.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jsc_trucks WHERE archived_at IS NULL AND is_active AND COALESCE(capacity_tonnes,0) > 0) THEN
    errs := errs || 'Aucun camion avec capacité configurée.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jsc_pickup_locations WHERE archived_at IS NULL AND is_active AND latitude IS NOT NULL AND longitude IS NOT NULL) THEN
    errs := errs || 'Aucun lieu de chargement géolocalisé.';
  END IF;
  IF (SELECT count(*) FROM public.jsc_settings WHERE archived_at IS NULL AND is_active AND value IS NOT NULL AND value <> ''
      AND key IN ('time_rounding_minutes','price_rounding_decimals','margin_percent','fuel_surcharge_percent','min_trip_minutes')) < 5 THEN
    errs := errs || 'Paramètres du moteur incomplets.';
  END IF;
  IF v_mode = 'production' AND NOT EXISTS (SELECT 1 FROM public.jsc_taxes WHERE archived_at IS NULL AND is_active) THEN
    errs := errs || 'Aucune taxe configurée.';
  END IF;

  RETURN jsonb_build_object('mode', v_mode, 'ok', cardinality(errs) = 0, 'errors', to_jsonb(errs));
END;
$$;

REVOKE ALL ON FUNCTION public.jsc_production_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jsc_production_guard() TO anon, authenticated, service_role;
