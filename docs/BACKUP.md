# Backups (to be finalised in Phase 14)
- Daily `pg_dump -Fc` to off-server storage, 14-day retention minimum.
- Or use managed Postgres with point-in-time recovery.
- Business data never lives in browser storage.
