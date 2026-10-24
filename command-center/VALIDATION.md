# Current validation evidence

Executed against the current code in the cloud environment:

- Migrations `002_job_workspace.js` and `003_private_job_files.js`: applied to the retained application database and a separate PostgreSQL test database without replacing existing application records.
- `DATABASE_URL=.../arced_test npm test`: **12 passed, 0 failed/skipped**. Real PostgreSQL assertions cover original lead-to-payment flow, duplicate conversions/payments, invoice/payment limits, client/property ownership and stale edits, concurrent change approval applying once, approval snapshots, negative budget/invoice-floor rollback, checklist completion/reopening, live role revocation, disabled divisions, New York summer/winter/DST handling, private file byte/type/size/name validation, wrong-job file denial, and client/worker office denial.
- `npm run test:browser`: **4 browser flows passed**: original lead/multiline-estimate smoke and full job-workspace flows at both 1440×1000 and 390×844 using system Chromium. Job flows create client/property/estimate/job, block completion with open tasks, upload/download a private file, add a note, approve a change, verify $1,250 contract/$600 budget/$200 direct cost, complete/reopen, create an invoice, and confirm private information is absent from customer print content. No JS page exceptions or horizontal page overflow in those flows. Screenshots inspected; this is not a complete accessibility audit.
- `npm run build`: passed.
- `npm audit --omit=dev --audit-level=high`: reported **0 vulnerabilities** at this check; this is not proof of comprehensive security.
- `node --env-file=.env tests/process-persistence.js`: passed again against the current code; a lead survived actual process termination/restart.
- Actual `backup.sh` and `restore.sh` invoked by `tests/backup-restore.js`: passed; **8 table counts matched**, and restored private file contents matched stored SHA-256. PostgreSQL 17 clients were invoked through local Docker wrappers because host client binaries are absent. The disposable restored database was removed after checking.
- Compose configuration: passed with local validation variables. It now includes a persistent private-file volume. Full Compose app startup and Docker image build remain unverified; the previous image attempt stalled in BuildKit dependency download. The non-Docker app is running and validated.
- `/api/health`: successful database-backed response. Existing root marketing site files remain unchanged. Credentials, dependencies, generated builds, backups and private files remain ignored/outside the checkout's public roots.

Known limits: access is still office-only. Client/worker roles are denied rather than given their eventual portal/crew workflows. No timesheets/labor approval, online provider payments, email/SMS, client portal, production object storage, or specialized snow/lighting/junk workflows are claimed as implemented. Password reset, user administration, granular grants and production hardening remain on REQUIREMENTS.md.

Branding is based on checked-in site styles; live-site retrieval was denied in the prior setup and was not retried this iteration. Current environment validation does not establish deployment, publication, or restoration in a fresh cloud task.
