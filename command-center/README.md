# ARCED Command Center

Contractor CRM under active development in `command-center/`. The original marketing site remains at the repository root. See [VALIDATION.md](VALIDATION.md) for executed checks and [REQUIREMENTS.md](REQUIREMENTS.md) for the complete continuation checklist; this is not the entire requested product.

## Prerequisites and startup

Node 22+ (tested with 24), npm, PostgreSQL 17. Backup/restore additionally requires PostgreSQL client tools, Python 3, tar and sha256sum. No external API keys are required for the implemented workflow. Work in this directory.

```sh
cp .env.example .env
# Edit DATABASE_URL, set SESSION_SECRET to a random 32+ character value,
# and choose SEED_EMAIL and a unique SEED_PASSWORD of at least 12 characters.
npm ci
npm run migrate
npm run seed
npm run dev
```

The server uses port 3000 and Vite middleware. Sign in with the email/password you selected for seeding. Seeding never replaces an existing user's password. Sample clients are fictional and mixed with this development database only; use an empty database for real business data. The onboarding instance has a random seed password in its ignored, mode-600 `.env`; do not publish or share that file. Set your own account credentials on a fresh database rather than exposing the generated secret.

For PostgreSQL without Docker, create a user and database through your operating system's PostgreSQL tools, set `DATABASE_URL`, and run the steps above. No SQLite or localStorage substitute is used.

### Docker Compose

Set `POSTGRES_PASSWORD` (URL-safe), `SESSION_SECRET`, `SEED_EMAIL`, and `SEED_PASSWORD` in your shell or `.env` first. The Compose database is private to its container network and persisted in the `database` volume. Private job uploads are persisted separately in the `private_files` volume.

```sh
docker compose up --build -d
docker compose exec app npm run seed
docker compose logs app
```

Compose is a local-development configuration. The cookie is not marked Secure for local HTTP. Production must run behind HTTPS, use secure session cookies (`NODE_ENV=production`), handle reverse-proxy trust according to the deployment, and keep the database private. Do not expose the development environment publicly.

## Verification

```sh
npm run build
# With the dev server running and a system Chromium installed:
npm run test:browser
# Create a separate empty database named arced_test first.
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/arced_test npm test
```

The API tests reset the test database and refuse database names not ending `_test`. They exercise real PostgreSQL. Production build: `npm run build`, then run `NODE_ENV=production npm run dev` with HTTPS termination and the necessary secure-cookie/proxy configuration. `npm run dev` serves static `dist` in production. Migrations must run before startup; never seed a production default account.

## Implemented workflow and limitations

Create a lead → convert to client/property → estimate → revise/print → record approval obtained outside the system → create job → schedule → invoice → record received payments. Open a job to manage completion tasks, private notes, photos/PDFs, cost budgets, change orders, expenses, and invoices. Open checklist items block completion. Completed jobs must be explicitly reopened before more work is added. Expenses feed direct-cost reporting. Approval locks the estimate; it captures a snapshot, not a claim of legal enforceability. The editor and API support multiple line items. Browser Print offers Save as PDF. There is no remote client portal yet.

All monetary values are USD integer cents; input accepts at most two decimals, with no floating-point multiplication for amounts. Quantities are whole units. There is no tax or discount engine yet. Invoices cannot exceed the job contract in aggregate; payments cannot exceed the invoice. Request keys prevent duplicate manual entries. Payments are never inferred from a clicked button or redirect.

Scheduling inputs and displayed appointment times use America/New_York regardless of device timezone. Invalid spring-forward times and ambiguous fall-back times are rejected; choose an unambiguous time. Calendar-only dates, such as invoice due dates, remain dates rather than shifting with timezone. Dashboard metrics are all-time and defined below their values. Gross profit is contract minus recorded direct expenses, excludes missing labor and overhead, and is not accounting/tax reporting.

Owner/admin/office manager/estimator access is implemented at the office level; estimators cannot write financial entries. Workers have their own time/review workflow and assigned job titles; office APIs remain denied to workers. Clients still have no portal. Do not use the current office model for third-party access. Every office API request reloads the current role, so revoking access does not require waiting for logout. Only owner/admin/office manager can set budgets or record change-order approvals. Password reset, granular worker/client roles, portal, communications, Stripe, timesheets, advanced modules, and many production controls remain unfinished. No integration is represented as connected.

Brand colors/text treatment come from the checked-in site: black/white, gold `#C8963E`, Inter/Montserrat declarations. Live `arcedllc.com` retrieval was denied by the environment proxy; its current deployed styles/assets were not verified. This app uses system font fallbacks and the existing ARCED text treatment rather than inventing a logo.

## Job changes, client records and private files

Add or edit clients from Clients, with separate billing addresses and multiple service properties. Client notes and property access instructions are private office information. Select the client, service property, and enabled division when creating an estimate. Settings allows owners/admins to rename or disable divisions; custom division branding/numbering is still unfinished.

In Jobs, choose **Open job**. Set the planned direct-cost budget, add checklist tasks, and record notes. Draft change orders do not affect the contract or budget. Record the actual client's approval received outside the app, including signer and consent; the exact version is locked, and the price/budget deltas apply once, even for simultaneous retries. Reductions cannot make the contract lower than invoiced amounts or make the cost budget negative. This remains staff-recorded approval, not a remote signature portal or guarantee of legal enforceability.

Private job uploads accept JPEG, PNG, WebP, or PDF, up to 10 MB each. Types are checked from file signatures, names normalized, storage keys randomized, and downloads require office authorization and matching job IDs. Downloads are attachments with no-store/nosniff headers. Nothing is served from a public uploads folder. This is a local adapter; production object storage, malware scanning, file versions, and client/worker sharing remain unfinished.

Set `UPLOAD_DIR` to a private server directory outside `web` and `dist`. For non-Docker development, `./uploads` is ignored and suitable. The cloud instance defaults to `/workspace/.arced/uploads`. Keep this directory persistent. Invoice Print / Save as PDF shows billing details and recorded payments and excludes private notes, access instructions, cost data, and files.

## Backup and restore

Install PostgreSQL client tools of the same major version as the server. Export `DATABASE_URL` and the same `UPLOAD_DIR` used by the app in the shell; shell scripts do not automatically read `.env`.

```sh
./scripts/backup.sh
# A directory is created containing database.dump, files.tar, and SHA256SUMS.
# Create a separate EMPTY restore database and EMPTY private-file directory.
# Never target the live database or its upload directory.
RESTORE_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/arced_restore \
RESTORE_UPLOAD_DIR=/path/to/empty/restore-files \
./scripts/restore.sh backups/arced-TIMESTAMP
```

Backup captures the database before immutable files, so committed file references are included. Restore verifies archive checksums and rejects unexpected filenames/links before restoring. An automated verification tool is available for a development database with permission to create/drop a disposable database:

```sh
# Requires at least one fictional upload in the source database.
node --env-file=.env tests/backup-restore.js
```

It runs the actual scripts, compares eight table counts, and verifies restored file contents against database SHA-256 values. Keep encrypted off-machine backups and test them regularly. Dumps and file archives contain sensitive business records, sessions and password hashes; restrict access. This is not a scheduled production backup service.

## Structure

`server/` Express auth/API; `web/` semantic HTML/CSS/modular JS; `migrations/` Knex versions; `tests/` API integration; `scripts/` migration/seed/backup helpers. `.env` is ignored and server-only. Never add private employee or client data to fixtures or frontend bundles.

### Cloud Docker build behind a trusted TLS proxy

The onboarding host uses a TLS proxy whose CA is trusted on the host but absent in the base image. The Dockerfile accepts an optional BuildKit CA bundle mount; verification stays enabled and the bundle is not copied into the image:

```sh
DOCKER_CONFIG=/workspace/.arced/docker-client docker build --network host \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --secret id=ca_bundle,src=/etc/ssl/certs/ca-certificates.crt \
  -t arced-command-center:dev .
```

Normal machines with public trust do not need the extra CA/proxy arguments. Never disable TLS verification to install dependencies.

## Daily Checklist

Use **Daily Checklist** for general errands, calls, follow-ups, or larger tasks broken into smaller steps. Add notes, Low/Normal/High/Urgent priority, an optional due date, and an optional job link. Today includes overdue and undated work; Overdue, Upcoming, All open, and Completed have their own views. Completing a task records the time and user; reopen it to return it to active work. Smaller steps must be finished before the parent task can be completed. Concurrent edits are checked so another save cannot silently overwrite a change.

These reminders do not block job completion; the existing job checklist retains that separate role. Dates use America/New_York. Tasks do not reset at midnight and recurring task generation is not yet supported. The local app needs this source update and migration before the menu appears; see [UPDATE-WINDOWS.md](UPDATE-WINDOWS.md) to update an existing Windows installation without replacing its configuration or Docker volumes.

## Team, time, overhead, equipment and hosted phones

Managers (owner/admin/office manager) can use **Team** to create employee logins, set private hourly rates, and assign jobs. Workers see only **My Time**, their assigned job titles and their own hours. They clock in, start/end unpaid breaks and clock out; server timestamps and a database uniqueness constraint prevent overlapping shifts. Managers review and approve closed shifts; approval posts labor cost once into the job expense ledger, using the rate captured at clock-in. Pay rates/costs and other employees' records are excluded from worker API responses. Shift-level submission, rejection/resubmission and manager-only approved-hours CSV export are implemented. Grouped weekly/pay-period sheets, approved-cost reversals and password reset are still unfinished.

**Business Expenses** is a separate overhead ledger with categories, dates, vendors, references and monthly/all-time totals. Job expenses remain in their existing ledger; avoid recording the same purchase in both. Managers can attach private JPEG/PNG/WebP/PDF receipts using the Receipts control; files do not create another expense or alter its amount.

**Equipment** records serials, replacement values, location/custody and available/assigned/missing/stolen/damaged/repair/retired states with chronological event history. Loss/theft requires notes; Available clears current custody and preserves the history. Managers can attach private photos and incident documents using Attachments. There is no automatic GPS, purchase/warranty history or specialized media gallery yet.

For employee access away from the Windows computer, see [RENDER-DEPLOY.md](RENDER-DEPLOY.md). The root Render Blueprint configures paid hosting, private PostgreSQL, a persistent file disk, HTTPS-proxy cookies and one-time owner initialization. It does not deploy merely by existing in GitHub. Production startup is `npm start`; local Windows development continues to use its existing starter. The hosted database starts clean; Windows data is not migrated automatically.


## Correcting employee time before approval

In **Team > Time approvals**, managers can select **Correct time** for an unapproved shift, including an open shift left running by mistake. Enter start/end in New York time, total unpaid break minutes and a reason visible to the employee. Saving closes an open shift, recalculates seconds/cost using its original captured hourly rate, and retains the original values in a manager-only correction history. **History** remains available after approval. Workers see their own latest correction reason without wage/cost values. Edits and approvals check the entry version; approved entries cannot be changed through this workflow. Financial reversal and approved-time adjustment remain unimplemented.


## Submitting, returning and exporting hours

After clock-out, an employee chooses **Submit hours**, checks their start/end/breaks, acknowledges review and can add a note. Managers see submitted shifts in Team, can reject them with a required employee-visible reason, and can approve a resubmitted current version. **Reviews** shows the protected submission/rejection/approval trail. A manager correction resets review to draft and requires employee review again. These are per-shift submissions, not grouped weekly/pay-period timesheets. To preserve compatibility, historical unapproved closed shifts are labelled **Legacy pending review** and remain eligible for manager review; no employee consent is inferred for those records. Approved entries stay locked. Resolve unsubmitted/rejected hours before deactivating an employee.

**Team > Export approved hours** downloads data only. Select inclusive New York clock-out dates (at most 367 days). It includes the entire approved shift, even if it began before the range, with UTC timestamps, canonical worked/break seconds, decimal hours for convenience, captured rate and recorded labor cost in USD cents. Shifts are not split across date boundaries; unapproved time is excluded. At most 10,000 rows are exported; narrow the range if needed. CSV cells are quoted and formula-leading text is escaped. This does not send payroll, pay staff, calculate tax/deductions, or determine labor compliance. Worker/estimator/client accounts cannot access this export.

Expense and equipment attachments use the existing private file directory, 10 MB limits, signature/type checks, normalized filenames and authenticated downloads. Only owner/admin/office manager can list, upload or download operations attachments; employees cannot see them merely because equipment is assigned to them. Existing job attachments retain their previous office permissions. Each file belongs to exactly one job, operating expense or equipment record, enforced by the database. These immutable attachments are included in the existing file backup archive. Metadata changes do not expose uploads publicly, and no external storage provider was added.
