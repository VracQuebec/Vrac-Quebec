CREATE TABLE public.test_phone_tokens (
  token_hash text PRIMARY KEY,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
COMMENT ON TABLE public.test_phone_tokens IS 'Essais téléphone TEST A uniquement : empreintes SHA-256 de jetons à usage unique (2 min). Aucun jeton en clair. À désactiver après les essais.';
GRANT ALL ON public.test_phone_tokens TO service_role;
ALTER TABLE public.test_phone_tokens ENABLE ROW LEVEL SECURITY;