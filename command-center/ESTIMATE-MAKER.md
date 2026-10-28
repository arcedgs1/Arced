# Arced Estimate Maker

The existing **Create estimate** action now opens Arced Estimate Maker. Legacy estimates keep their existing revision form. Estimate Maker drafts use the existing client/property/division records, approval action, job conversion, invoicing and expense ledger.

## Field-to-job workflow

1. Create/select the client and service property, then choose **Create estimate**.
2. Enter the customer scope, inclusions, exclusions and terms. Record measured values/dimensions with their units and method. Enter takeoff quantities explicitly; dimensions are reference evidence and do not automatically generate quantities.
3. Add internal cost rows for materials, labor, subcontractors, disposal, equipment, permits or other costs. Labor quantity is hours; its unit cost should be the loaded hourly rate. Quantities support three decimal places. Material waste supports two decimal places of percent. Include purchasing tax, delivery and freight where applicable in costs.
4. Save the draft, then upload photos, walkthrough videos, voice notes or PDFs. Private uploads accept one file up to 25 MB per request and use the existing UPLOAD_DIR and backup procedure. Upload also saves the current draft. Voice recording requires HTTPS (localhost also works), microphone permission and MediaRecorder support. Recordings stop after two minutes. Audio/video are retained as evidence; automatic transcription, media interpretation and automatic takeoff are not implemented. Write the reviewed observations in scope/notes.
5. Record material unit prices with supplier, product/quote URL, date checked, store/ZIP and package/tax/delivery details. A source entered by staff is labeled **Source recorded**, never verified. Quotes older than seven days prompt a recheck. Unsourced prices remain **Unverified** allowances.
6. Optionally use **Check current prices** for live web research. Review the dated result and cited supplier pages, then enter the applicable price and source in the cost line. Research does not overwrite costs. Failed, uncited or unconfigured research never becomes a current price. Search evidence is retained separately.
7. Review overhead, contingency, profit and tax. Default percentages are editable assumptions. Confirm the review checkbox, save, then use **Saved customer estimate / print** or **Saved internal breakdown / print**. The two print actions render only the saved version; save changes before printing. Customer documents contain the customer scope, selling subtotal and optional sales tax, without private costs, sources, notes or profit.
8. Close the editor and use the existing **Record approval** action after actual customer approval. Approval checks the displayed version, locks the estimate and captures its internal/customer snapshot. Evidence remains downloadable; approved scope and costs cannot be revised. Use a job change order for additions.
9. **Create job** copies the customer contract and the internal cost budget exactly once. Open the job for the category comparison. Existing job expenses and approved employee time supply actual costs. Disposal, permits, overhead and contingency now have explicit job-expense categories. Do not duplicate approved employee hours as manual labor expenses.

## Calculation rules

All monetary arithmetic uses integer cents with BigInt intermediate multiplication and half-up rounding at each step. Quantities are stored in thousandths and percentages in basis points.

- Cost row = quantity × unit cost × (1 + waste%).
- Direct costs = all cost rows.
- Overhead = direct costs × overhead%.
- Contingency = (direct costs + overhead) × contingency%.
- Cost budget = direct costs + overhead + contingency.
- Markup profit = cost budget × profit%.
- Margin profit = cost budget × margin% / (1 − margin%). Margin must be below 100%.
- Selling subtotal = cost budget + profit.
- Optional sales tax = selling subtotal × configured tax%. This is a simple full-subtotal tax setting, not an automatic jurisdiction/taxability determination.
- Customer total = selling subtotal + sales tax.

Original category estimates remain the baseline after approval. Approved change orders and manual budget edits affect the current job budget separately; they do not rewrite original category estimates. Positive category variance means budget remaining. Recorded costs are incomplete until all actual invoices, labor and allocations are entered. Business Expenses stay separate: overhead is allocated only when explicitly recorded as a job expense. Contingency is a reserve; classify actual spending by its true category, or explicitly allocate to contingency if that is your bookkeeping convention.

## Server configuration

No new dependency or account is needed for manual estimating. Run the existing migration command (production startup already does this) to apply migration 007. It adds a nullable maker JSON field and two new evidence tables without changing existing records.

Optional live research uses OpenAI Responses with the web_search tool. Set OPENAI_API_KEY only in the existing service's secure runtime environment. ESTIMATE_PRICE_MODEL defaults to gpt-4.1 and may be set to a model with Responses/web_search support. This uses API billing separate from ChatGPT. Never put keys in client code, the repository or a chat. Only the explicit material query and location are sent; job media, customer identity and internal notes are not sent. Requests have a 60-second timeout, rate limit, store:false and require a completed search with HTTP(S) citations. A live provider call was not exercised during validation because no real key was configured; the provider success/error paths were tested with fixtures.

Official API reference: https://developers.openai.com/api/docs/guides/tools-web-search

## Verification and deployment

The automated suite covers calculation bases/rounding/limits, source validation, signatures, exact-version approval, private customer serialization, stale edit rejection, idempotent creation/conversion, evidence authorization and approved locks, provider configuration/research persistence, budget transfer and actual cost variance. The existing CRM suite also passes. The local browser was used to create and save an estimate with measurements and verify the calculated totals.

Deployment remains the existing Render workflow on codex/arced-crm-windows. This change is prepared on a separate feature branch for review alongside the ongoing CRM work. Merge it into that branch, deploy the merged commit on the existing service, and verify a real-phone upload/voice recording and live price lookup after securely configuring the optional key. No production data or Render settings were changed by this implementation.
