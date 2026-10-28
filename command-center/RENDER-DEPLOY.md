# Put ARCED CRM online for employee phones

This is a concrete deployment configuration, not an already deployed website. Use the root `render.yaml` on branch `codex/arced-crm-windows` in `arcedgs1/Arced`.

## Resource configuration

The Blueprint creates one Starter Node web service, one Basic-256mb PostgreSQL 17 database with 1 GB storage, and a 10 GB private-file disk. It uses Render's included HTTPS address; a custom domain is optional. At the pricing checked during this session, app compute is $7/month, database compute $6/month, and file disk $0.25/GB/month ($2.50/month for the configured 10 GB), plus applicable database storage charges, taxes, bandwidth/usage, or workspace upgrades. The actual Render review screen is authoritative. There is no autoscaling or automatic upgrade configured. Manual deployments are configured so future code pushes do not silently go live.

## Beginner deployment steps

1. Open https://dashboard.render.com/ and sign in with GitHub.
2. Choose **New + > Blueprint** (not Static Site). If needed authorize Render to access **arcedgs1/Arced**.
3. Select the repository and choose branch **codex/arced-crm-windows**. The Blueprint file is **render.yaml** at the repository root. If the default branch does not show the file, switch branches in this setup screen.
4. Give the Blueprint a name such as **ARCED CRM**.
5. Enter **SETUP_OWNER_EMAIL** and **SETUP_OWNER_PASSWORD** only in Render's setup form. Choose an owner password of 12–200 characters; do not put it in GitHub, a source file, a screenshot, or chat. Render generates the session secret and database credentials automatically.
6. Review the listed services/charges, then use Render's create/apply/deploy control. Enter billing information in Render if requested. The budget has been approved in the chat; service creation still happens in your Render account.
7. Wait for the database and web service to become healthy. Open **arced-command-center** and use its displayed **https://...onrender.com** address. Do not guess the address: Render can add a suffix if a name is taken.
8. Sign in using the owner account you chose. The initial deployment has a new, clean database. Data from your Windows installation has NOT automatically been moved; your Windows database remains untouched.

If deployment fails, open the service's Logs and share the error text after removing any credentials. The startup creates/migrates the database, initializes the owner account only if no users exist, and serves the built frontend. Re-deployments preserve users and never reset their passwords. The bootstrap password is removed from the live Node process after initial setup; you can remove the two SETUP_OWNER variables from the Render service environment after the first successful login because they are not needed again unless the database is empty. Database access is private-network-only. Secure cookies depend on Render's HTTPS proxy with TRUST_PROXY_HOPS=1; don't copy that setting to an arbitrary directly exposed server.

## First employee trial

1. Create a client, approved estimate and job using the existing workflow, or use a clearly fictional test job first.
2. Open **Team > Add employee**. Enter their contact information, private hourly rate, login email, and an initial 12+ character password. Select their assigned jobs. Share credentials privately, not in chat. Employee self-service password change/reset is not implemented yet.
3. Send that employee the same HTTPS website address. They sign in from their phone and see **My Time**, not the office workspace or financial records.
4. Have them choose an assigned job, clock in, take/end a break, clock out, review their hours and choose Submit hours. They must be online; do not assume an offline button press saved a time event.
5. Open **Team** or click **Refresh** to fetch their latest hours. Check the submitted times before approving. Reject with a reason if resubmission is needed. Corrections reset submission and require the employee to review again. Approval posts the captured hourly labor cost to the job once. Breaks are unpaid; cost is rounded to the nearest cent, half up. Manual labor expenses remain separate: do not enter the same shift's cost manually and approve it again.
6. Test that a worker cannot access office records and cannot see rates. Run this real-phone trial before asking the whole crew to rely on it.

## Current limits

Employee clock-in/out, breaks and manager approval are implemented. Per-shift submission/rejection/resubmission and manager-only CSV data export are implemented. Grouped weekly/pay-period sheets, employee password change/reset, location capture, approved-time reversals, offsite scheduled backups, and full production/accessibility review are unfinished. Do not treat recorded time as a complete payroll/tax system. Employees can't clock into unassigned or completed jobs; managers can't deactivate an employee with an open shift. There are no email/SMS providers configured.

**Business Expenses** records overhead separately from job costs and provides current-month and all-time totals. Receipt reference text is supported; private receipt uploads are supported; recurring bills and accounting integrations are not implemented.

**Equipment** records names, serials, replacement values, custody, locations and status history. Missing/stolen states require incident notes. Returning to Available clears current custody but retains its history. Private equipment photo/incident attachments are supported; purchase/warranty details, inventory bulk import and GPS/hardware integrations remain unfinished.

Persistent private uploads are on `/var/data/uploads`; database and file backups are separate. Use README's backup/restore procedure and retain an encrypted offsite backup. The backup verification script now checks 20 table counts including employees/time/overhead/equipment and file hashes. The small paid configuration is an initial capacity choice; monitor memory, disk use and database storage before adding a large crew.

After deploying this update, refresh both manager and employee browser tabs. Approved-time CSV is data export only, not payroll submission/payment/compliance processing. Legacy closed pending shifts remain eligible for manager review under the explicitly labelled legacy state; they are not recorded as employee-submitted. Rollback is blocked if it would discard operations attachment references or review history.
