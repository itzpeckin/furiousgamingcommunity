# Recovery

Rollback Pages to the preceding 8.2.23 deployment if needed. Preserve beta application approval guards and the existing private email Worker. To close demo access without changing customer leagues, set tenant_status='disabled' only for id='league_fhq_public_demo' and slug='demo'. Keep the demo row for investigation; no database restore, customer snapshot rollback or OTL recreation is required. All public demo content comes from the source version, with no credentials or live integration bindings.
