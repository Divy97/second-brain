# Nightly Backups

Issue: #55

## Scope

The scheduled Worker writes one UTC backup prefix per day.

## Acceptance

- DB tables are exported as JSON into backup storage.
- R2 item files are copied into backup storage.
- Existing hourly file cleanup keeps running.
- Backup failures are logged and do not block file cleanup.
