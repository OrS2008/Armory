-- Two shifts of one post at the same hours. Easy to create by running a
-- rotation twice, and invisible on a board that lists every shift separately.
INSERT OR IGNORE INTO scheduling_rules
  (id, org_id, code, name, enabled, severity, overridable, config, created_at, updated_at) VALUES
  ('rule_duplicate','org_default','DUPLICATE_ASSIGNMENT','אותה משימה נוצרה פעמיים',1,'warning',1,'{}',0,0);
