# Nightly Backups

Issue: #55

## Scope

The scheduled Worker writes one UTC backup prefix per day.

## Acceptance

- DB tables are exported as JSON into backup storage.
- R2 item files are copied into backup storage.
- Existing hourly file cleanup keeps running.
- Backup failures are logged and do not block file cleanup.

## Amendment: opt-in and retention

- Backups run only when the `NIGHTLY_BACKUPS` var is `on`. It defaults to `off` in `wrangler.jsonc` until real users exist.
- After a successful backup, prefixes older than `backups.retentionDays` (7, in `apps/api/src/lib/config.ts`) are deleted. A failed backup never prunes.
- Hourly file cleanup is unaffected by the flag.
