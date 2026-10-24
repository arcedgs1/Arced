# ARCED Command Center — implementation checklist

Status: **initial working release, not the complete requested product**. The existing marketing site is untouched. The pasted product brief remains the acceptance baseline.

Dependencies: PostgreSQL → migrations → authentication/authorization → clients/properties → estimates → jobs → invoices/payments. Scheduling and costs depend on jobs. Portal, crew, communications, recurring services, and integrations require additional schemas and access models. Local private files and job workspaces are implemented.

## Implemented and subject to validation
- [x] Separate Vite vanilla JS frontend and Express backend, PostgreSQL/Knex, lockfile, migrations.
- [x] Black/gold branding derived from repository styles; configurable CSS tokens, responsive shell and light/dark switch.
- [x] Password hashing, database sessions, CSRF token, login throttling, security headers, office role gates.
- [x] New leads → transactional, idempotent client/property conversion.
- [x] Fixed-price estimate API with multiple line items, whole-unit quantities and exact integer-cent arithmetic.
- [x] Multiline estimate editor, draft revisions with optimistic version check, print/save-PDF using browser.
- [x] Staff-recorded approval, signer, consent, timestamp, exact approved-version snapshot.
- [x] Transactional, idempotent approved-estimate → job conversion.
- [x] Crew schedule interval validation and case-insensitive conflict prevention, serialized per crew.
- [x] Job workspace, completion checklist and reopening, private job notes, direct expense ledger, direct-cost budgets and contract/cost reporting.
- [x] Approved change orders with document snapshots, one-time contract/budget updates and invoice-floor checks.
- [x] Editable clients/billing addresses, multiple service properties and private access instructions, optimistic edit versions.
- [x] Office-only local JPEG/PNG/WebP/PDF uploads, protected attachment downloads, type/size limits and safe storage keys.
- [x] New York scheduling independent of device timezone, DST gap/ambiguity rejection and calendar-date handling.
- [x] Branded invoice print / browser Save as PDF, with private information excluded.
- [x] Division renaming and enable/disable, mobile-accessible Settings and Help.
- [x] Deposit/progress/final invoices with contract-value limit; manual partial/final payments and outstanding balances.
- [x] Invoice/payment request keys and financial row locks.
- [x] Deterministic all-time dashboard briefing and record-linked metrics, current-view filtering, report CSV export.
- [x] Explicit honest integration setup status, workflow Help, offline notification, validation messages.
- [x] Docker Compose, non-Docker instructions, backup/restore scripts.

## Foundation and security continuation
- [ ] Password reset, user invitation/management, per-record worker/client grants, seven complete role workflows.
- [ ] Audit all writes (job tasks/notes/budgets/changes/files and client/property/division edits are audited; original lead/estimate creation and expense writes still need coverage).
- [x] Concurrent-edit protection for estimate, client/property, task and budget edits; immediate role refresh on office API requests.
- [ ] Concurrent-edit protection for remaining editable records, archive/restore and undo.
- [ ] Accessible browser audit, comprehensive mobile/accessibility acceptance and production deployment hardening.
- [ ] Transactional property ownership enforcement on all relevant writes at database level.

## Today and CRM
- [ ] Date/division filters, labor-inclusive profitability, permits/documents/deposit/task deadlines.
- [ ] Multiple contacts, tags, preferences, languages, owners, sources, custom fields.
- [ ] Searchable private notes and full activity history; duplicate preview/merge.
- [ ] Lead Kanban/configurable stages, priorities, values, next action/follow-up.
- [ ] Public spam-protected lead intake; mapped CSV import, validation preview, duplicate handling/errors and full exports.

## Estimates and job management
- [ ] Rich multiline editor, saved services/scope templates, fractional units, tax, discounts, markup/margin targets.
- [ ] Time/material, options, allowances, alternate items, payment schedules and configurable legal terms.
- [ ] Sent/viewed/declined/expired states, secure remote review links and remote approval, server PDF generation.
- [ ] Milestones, task dependencies, full punch-list workflows and client completion sign-off.
- [ ] Employees/subcontractor assignments, daily logs, photos, permits, inspections, warranties/callbacks.
- [ ] Receipt uploads, purchase orders, committed-cost matching, labor/overhead allocation and full financial reports.

## Scheduling, crews and finance
- [ ] Day/week/month views and drag-drop, recurring visits, equipment availability, time off, configurable crew resources.
- [ ] Server-generated invoice PDFs, statements, aging buckets, credits/refunds and correction history.
- [ ] Consent-based reminders with explicit previews/history, Stripe hosted checkout and verified/idempotent webhooks.
- [ ] Clock-in/out, breaks, approvals, corrections, daily/hourly pay, labor burden and payroll export.
- [ ] English/Spanish crew workflows, permission-based location, employee/subcontractor documents/onboarding.

## Specialized divisions
- [ ] Per-division branding, numbering, templates, services and reporting (renaming/enabling already implemented).
- [ ] Snow seasonal/per-event/tier pricing, storm dispatch, route ordering/map links, visits/photos/salt/incidents.
- [ ] Lighting measurements/design, install-maintenance-takedown-renewal, ownership/storage/assets.
- [ ] Junk volume/item pricing, loads, disposal fees/receipts/photos, alternate branding.
- [ ] Renovation room scopes, allowances, claims/adjusters, supplements and requested/approved/invoiced/received amounts.

## Portal, communication, inventory and settings
- [ ] Record-linked communication timeline; provider adapters, draft previews, explicit send and consent controls.
- [ ] Expiring/revocable portal, client-visible documents/updates isolated from private staff information.
- [ ] Inventory/equipment/vehicles, stock movement, assignments, maintenance, suppliers and purchase orders.
- [ ] Production object-storage adapter, file folders/tags/version metadata, scanning, upload percentage progress and granular sharing. Local private uploads/downloads are implemented.
- [ ] Global role-filtered search, pagination, bulk actions, saved views, autosaved drafts.
- [ ] Editable company/templates/tax/numbering/permissions/notifications and complete bilingual interfaces.

## Acceptance test continuation
Current API suite exercises the vertical workflow, duplicate/concurrent change approvals, conversion/payment behavior, overbilling, conflicts, CSRF, stale edits, file access, DST handling and denial of office access to workers/clients. Denial is not a complete worker/client product.
- [x] Upload/file authorization and staff-recorded change-order approval/contract/budget checks.
- [ ] Approved labor/cost totals and provider webhook duplicates.
- [ ] Portal expiration/revocation; snow visits; lighting install/takedown.
- [x] Real process restart persistence and automated database/private-file backup-restore verification using the actual scripts.
- [x] Desktop/mobile browser job-workspace flows, approval/checklist guards, upload/download, private-safe print layout.
- [ ] Full requested mobile/desktop workflow coverage, complete keyboard/accessibility and empty/error-state acceptance.

Next stage: implement employee/crew accounts with record-specific grants, timesheet submission/approval and labor costing, then portal access and communications before specialist modules. Do not claim this checklist is complete because the initial workflow passes.
