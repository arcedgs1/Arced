# Bounded continuation checklist

This file narrows execution priorities; REQUIREMENTS.md and the original brief remain the full scope. No pending module is declared complete by this plan.

## Current completed increment
- [x] Correct unapproved hours / close a missed clock-out, requiring a manager reason.
- [x] Preserve before/after records and show manager-only history after approval.
- [x] Show an employee their own latest correction reason without rates/costs.
- [x] Detect stale edit/approval requests, serialize against employee clock events, and keep approved costs locked.
- [x] Include correction history in database backup verification.

## 1. Resolve existing Render deployment
- [ ] Confirm deployed commit and retrieve only redacted Owner setup diagnostic/status.
- [ ] Correct only the setting identified by that diagnostic, through secure Render settings; never request its value in chat.
- [ ] Verify live HTTPS login, private uploads, restart persistence and one employee's real-phone clock/break/out/approval.
No replacement service, database, paid tier, password reset or credential/account change is authorized merely by this checklist. Keep existing resources and data.

## 2. Finish workforce acceptance in a separate bounded increment
- [ ] Formal worker timesheet submission and manager rejection/resubmission.
- [ ] Manager-only payroll-ready export with clear date and rounding definitions.
- [ ] Approved-time reversal/adjustment design preserving posted financial history; do not mutate approved expenses in place.
- [ ] Bilingual crew UI, rate history/burden and daily-rate allocation with explicit assumptions.

## 3. Operations detail
- [ ] Private overhead receipt attachment adapter and equipment photos/incident attachments.
- [ ] Equipment purchase/warranty/maintenance metadata, filters and export.
- [ ] Offsite scheduled backup and restore verification; determine destination/credentials securely before connecting a provider.

## 4. Remaining original acceptance scope
- [ ] Portal and expiring/revocable client access, remote approved-document links, communication draft adapters and opt-in delivery.
- [ ] Optional provider checkout/webhooks after a provider is chosen and securely configured.
- [ ] Full estimating/tax/catalog, recurring/day-week-month scheduling and advanced reports.
- [ ] Snow visit and lighting install/takedown acceptance, junk and renovation/insurance workflows.
- [ ] Remaining security/accessibility, CSV import, inventory, archive/restore and permission tests from REQUIREMENTS.md.

## External capability boundary

Tools exposed in this executor do not include a Render connector or browser/computer-control tool. A local Chromium/Playwright installation can test this application, but is not Randy's signed-in Windows browser. The supplied browser runtime helper's supported `ensure` command failed because BROWSER_CONFIG_AUTH_TOKEN was unavailable; `show` reported no active browser. No token/cookie values were read, extracted or requested. Provisioning an authenticated browser bridge or returning a redacted Render diagnostic is needed to inspect the existing deployment. Do not bypass that boundary, create replacement accounts, or change security settings to gain access.
