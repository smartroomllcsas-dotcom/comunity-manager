CREATE TABLE IF NOT EXISTS os_org_theme (
  org_id      uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  accent_hue  int NOT NULL DEFAULT 250 CHECK (accent_hue >= 0 AND accent_hue <= 360),
  theme_mode  text NOT NULL DEFAULT 'dark' CHECK (theme_mode IN ('dark','light')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE os_org_theme ENABLE ROW LEVEL SECURITY;
CREATE POLICY os_org_theme_read ON os_org_theme FOR SELECT USING (org_id = os_current_org());
CREATE POLICY os_org_theme_write ON os_org_theme FOR ALL USING (org_id = os_current_org()) WITH CHECK (org_id = os_current_org());

-- DOWN (Sprint 4 theme rollback):
-- DROP TABLE IF EXISTS os_org_theme CASCADE;
