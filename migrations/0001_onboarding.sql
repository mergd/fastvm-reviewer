CREATE TABLE IF NOT EXISTS onboarding_repositories (
  full_name TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  draft_profile_json TEXT,
  approved_profile_json TEXT,
  secret_keys_json TEXT,
  validation_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS onboarding_repositories_installation_idx
  ON onboarding_repositories (installation_id);

CREATE TABLE IF NOT EXISTS onboarding_secrets (
  full_name TEXT NOT NULL,
  key_name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (full_name, key_name)
);
