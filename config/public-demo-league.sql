-- Explicit provisioning for the public demo. Fails on an existing ID or slug:
-- never convert a customer league into a publicly accessible demo.
-- All demo content is the versioned fictional dataset in demo-league-data.js.
INSERT INTO leagues(id,name,slug,current_season,current_week,public_status,tenant_status,timezone,branding_json,configuration_json)
VALUES('league_fhq_public_demo','FHQ Demo League','demo',2027,8,'active','enabled','America/Chicago','{"displayName":"FHQ Demo League"}','{"publicDemo":true,"dataProvider":"fictional-demo-v1"}');
