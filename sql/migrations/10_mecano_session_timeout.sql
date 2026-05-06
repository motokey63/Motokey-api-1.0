ALTER TABLE garages
  ADD COLUMN IF NOT EXISTS mecano_session_timeout_minutes INTEGER DEFAULT 60
  CHECK (mecano_session_timeout_minutes IN (15, 60, 480));

COMMENT ON COLUMN garages.mecano_session_timeout_minutes IS
  'Politique de timeout session MÉCANO en minutes. 15=strict, 60=modéré, 480=souple. Configurable par PRO+.';
