-- Short-lived browser-bound login challenges; plaintext codes are never persisted.
CREATE TABLE auth.email_login_codes (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 code_hash text NOT NULL CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_login_codes_user ON auth.email_login_codes(user_id);
CREATE INDEX email_login_codes_expiry ON auth.email_login_codes(expires_at);
REVOKE ALL ON auth.email_login_codes FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.email_login_codes TO o2c_app;
