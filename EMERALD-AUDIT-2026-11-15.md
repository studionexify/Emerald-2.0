# Emerald 2.0 — audit of UI/UX flaws and operation bugs (15 Nov 2026)

Scope you gave: 3D-printer logs, filament/spares stock, the three order types, **Mauny** (money), **Invoices** (client data, series, type), and anything not needed that gets in the way.

## How this was tested — read the tags

| Tag | Meaning |
|---|---|
| **[UI]** | Reproduced by clicking through the running app in a headless browser (desktop 1440×900, phone 390×844, tablet 820, timezone Asia/Kolkata). |
| **[FN]** | Reproduced by calling the app's own functions in a running build (same code the buttons call), with throw-away data. A UI path to it exists unless noted. |
| **[CODE]** | Read from the source only, not executed. `file:line` given. |

Limits, stated plainly:
- All runs used **demo or throw-away data, never your real data**. I could not see what is in your live database.
- **Cloud sync was read, not run** (no Supabase project reachable). Sync findings are [CODE].
- Baseline before my changes: `tsc` clean, `npm run build` + `size-check` pass. `npm run check:colors` **already fails** (hex colours in `Workshop.tsx`, `MaunyHome.tsx`); I added none.
- All 44 routes were opened on desktop and phone: **no console errors, no page-level horizontal overflow** — the shell is solid. The problems are in the logic and in specific flows.

---

## 1. Fix first (can silently corrupt money or data)

| # | Finding | Tag | Where |
|---|---|---|---|
| 1 | **A fragile rule deletes any record whose id looks like `s1`, `c12`, `o7`.** `purgeSample()` removes every record with an id matching `^[a-z]{1,3}\d{1,3}$` on each load and syncs the deletion; `applyRemote` also refuses to load them. Test: a spool `s1` and client `c1` vanished after reload. **Today it is aimed at the old demo rows** — spools `s1…s6` (PLA Black Bambu, PETG White, PLA Gold …, bought 2026-10-12) are defined in `mock/data.ts:47-52`, so the five "in stock, no label" spools in `spool-recovery-report.md` are **sample rows, not real spools**. Because devices refuse to load them, nothing ever deletes them from the cloud, so they sit in the database and in that report. **Risk:** any real record that gets a short id (I saw only spool ids in your report: `SP-…` and UUIDs are safe; the shapes of Emerald-1 client/order/machine ids were not checked) would silently disappear. | FN | `data/store.ts:109-117`, `data/index.ts:139`, `mock/data.ts:47-52` |
| 2 | **Expenses entered on Mauny's Entry screen never reach Books.** They are only written to the cash ledger. After a ₹18,000 "Rent" entry: cash out −18,000, Finance "Spent" 0, Books P&L indirect expenses 0. Dashboard profit, P&L, GST ITC and the Tally export all miss them. Only the Finance → "Add expense" form and bill confirmation create expense records. | FN | `routes/MaunyHome.tsx` save → `ledger.ts:179 addMoney` (no `Expense`) |
| 3 | **Bank-statement "Confirm" never marks the invoice paid.** It looks for the old number format `B/12-34/2025`; today's numbers are `B-019`. Result: the line is booked as *Other income* and the invoice stays unpaid — revenue counted twice. | FN | `ledger.ts:228` |
| 4 | **Statement CSV parsing is wrong for Indian bank files.** `"1,25,000.00"` is read as `1`; two identical same-day UPI payments are collapsed as duplicates and one is dropped. Columns are fixed to `date, narration, debit, credit`. The file picker also accepts `.pdf/.xlsx` but only CSV works (the "server reads it" path does not exist). | FN + UI | `ledger.ts:198-210`, `routes/Mauny.tsx:316` |
| 5 | **Cancelling a paid invoice keeps the money receipt.** Cash balance still includes it; the order stays "invoiced". The Cancel button is shown on paid invoices (any issued invoice in an unlocked GST month), so this is reachable. | FN + CODE | `ledger.ts:112`, `InvoicePage.tsx:262-263` |
| 6 | **"Mark unpaid" does not remove a receipt made from Mauny Entry** (it only removes `source: invoice_desk`). Mark paid again → two receipts, cash double counted. | FN | `ledger.ts:122-125`, `MaunyHome.tsx` (`source: "mauny_entry"`) |
| 7 | **Credit notes do not reduce what the customer owes.** ₹11,800 invoice + full credit note → outstanding still ₹11,800, debtors still ₹11,800. | FN | `ledger.ts:113`, `books.ts` debtors |
| 8 | **Dates use UTC, not India time.** Between 00:00 and 05:30 IST the app thinks it is yesterday. At 01:30 IST on 1 Apr 2027 it proposed the *old* financial-year series (`B-019`, should be `C-001`). "Last month" report window is also one day off in IST (30 Sep–30 Oct instead of 1–31 Oct). | FN | `data/store.ts:105`, `ledger.ts:252` |
| 9 | **An invoice date before Apr 2025 crashes the invoice window**, and the saved draft crashes again whenever it is opened (no error boundary). Any date before 1 Apr 2025 triggers it (a back-entered old invoice or a mistyped year). | UI | `ledger.ts:74 fyLetter` throws; `InvoicePage.tsx` DraftWindow renders `problems()`/`nextNo()` |
| 10 | **Order numbers are reused.** Delete the newest order to the Bin → next new order gets the same `EM-` number → restoring the first creates two orders with one number. Also two devices offline can both take the next number. | FN | `data/index.ts:72` |

## 2. Invoices — against your three requirements

**Client data (saved / auto-populated)**
- Works: autofill by GSTIN, then name, from the client list and past invoices; address/state/contact/email copied onto the invoice; GSTIN format and state-code checks. Good.
- **Name-only matching merges different people** and overwrites the saved one. Two "Rahul Shah" (Vadodara, then Mumbai) → one client record, the first one's address/phone lost. [FN] `invoicing.ts:70-95`
- Walk-in/B2C customers are forced to give an address and state before an invoice can be issued. [CODE] `invoicing.ts:125-126`
- Invoices store a *copy* of the party, with no client id, so later client corrections do not link back. [CODE]

**Series**
- Works: number is taken only on issue (drafts have none), gapless per financial year (A-/B-/C-), cancelled numbers kept, backdating blocked, seller details frozen at issue.
- `resequence()` would renumber **all** invoices including paid and cancelled ones (test: `B-019,B-020 → B-001,B-002`, receipts left pointing at old numbers). **No button calls it today**, so it is dormant — delete it before someone wires it up. [FN] `ledger.ts:127`
- `fixKnownInvoices()` runs every time the Invoice page opens and rewrites issued invoices B-015 and B-017. Remove after the one-time correction. [CODE] `invoicing.ts:193`, `InvoicePage.tsx:276`
- Two devices issuing at once can produce the same number under different ids; only the local list is checked. [CODE] `invoicing.ts:148-157`
- Issuing is not blocked in a GST month already marked "filed & locked". [CODE]
- Credit notes carry no frozen seller details or bill-to block. [CODE] `ledger.ts:113`

**Type (which kind of order) — missing.** `Invoice` has no type field (keys checked: id, kind, no, date, customer, lines, … orderNo, batch — nothing for Client / Bulk / B2B / In-house). A blank invoice has no order link at all. Recommendation: add `type` (copied from the order's segment on issue; chosen from a list on blank invoices) and show it as a column and filter in the register and Books.

## 3. Mauny and GST

- **Layout** (UI): the first screen was a ~700 px entry form; no balances, no dues, no GST status. **Redesigned — see section 6.**
- **Statements were hidden in the tab called "Settings"** (page title "Mauny settings"). Renamed to "Statements & wallets". [UI]
- **Day book columns are inverted**: money out shows under *Debit*, money in under *Credit*. Cash-book convention is the opposite; your CA will notice. [UI] `Mauny.tsx:83`
- **Three different "earned" numbers**: Dashboard (earned − spent), Finance ("Earned" = collected incl. GST + closed unbilled orders), Mauny (cash inflow). In the demo: Dashboard "Earned · month" ₹2,301, Finance "Earned" (FY to date, includes GST) ₹15,517, Mauny November inflow ₹38,880 — no labels explain the difference. [UI]
- **GST desk**: "Mark filed & lock" sets GSTR-1 and GSTR-3B together (cannot record 1 filed, 3B pending); no due dates (the new card shows 11th/20th for monthly filers); "Net payable" adds up months with no ITC carry-forward; ITC counts every logged bill, with or without a vendor GSTIN; purchases from other states are split CGST/SGST instead of IGST (Karnataka vendor test: 90 + 90 + 0). [FN + CODE] `books.ts:11`, `routes/Mauny.tsx:409`
- Part payments are accepted on Mauny Entry and the new **To collect** card nets them, but the invoice register, Finance "Outstanding" and Books debtors use the full invoice amount — those numbers will differ. TDS is only used in statement matching, not when recording a payment. [CODE]
- Loans: interest is charged for a full year on any open balance; repayments do not reduce the loan (only `loan_taken` is handled). Balance sheet has a "suspense" plug. [CODE] `books.ts:31`, `ledger.ts:179-183`
- Tally XML: purchase vouchers carry no GST ledgers; every expense (salaries, rent) is exported as a *Purchase* voucher. [CODE] `books.ts:102`
- Every expense must be given a "For" (order / in-house / other) before saving; a quick entry takes an extra tap each time. [UI]
- Exports are CSV without formula-injection protection (a client named `=…` runs in Excel). Low. [CODE]

## 4. Operations — printers, filament, orders

- **Printer logs are not fed by the Floor sheet.** A plate run (start → finish) left printer lifetime hours unchanged (100 → 100), created no job rows, so the printer's failure %, "next service in … h" and the failure-rate alert never move; only filament is recorded (no machine hours, no electricity). Only the older Production-page jobs update machine/power cost. [FN] `data/floor.ts:302-329`, `routes/work/Stages.tsx:32`, `data/inventory.ts` `machineStats`
- **Order cost is fiction.** New orders get `cost = price × 30 %`; the Archive page then splits it 45/30/25 % into Material/Machine/Pack. Test: 50 × ₹100 order has cost ₹1,500 while real consumption was ₹75. Dashboard shows "70 % margin" and the order panel "100 % margin" when nothing is recorded. [FN + UI] `data/index.ts:126`, `routes/work/Stages.tsx:291-293`
- **"New order" saves with nothing filled in**: an empty form created `EM-2111 · New client · Item · ₹0` (due today, so it also shows as a missed date). The form has two different "type" controls (In-house/Client/Bulk and Order type Small/Bulk/B2B). [UI] `data/index.ts:120-127`
- Floor sheet takes filament from the **fullest spool of that colour**, not the spool loaded on the printer, so per-spool grams drift from the numbered spools on the shelf. [CODE] `data/floor.ts:14`
- Filament cost in consumption uses the material price table, not that spool's own `₹/kg`. [CODE] `data/index.ts:97`
- Bill → stock assumes 1 kg spools: 400 g becomes one 1000 g spool; 1.5 kg becomes 2 spools. [CODE] `data/index.ts:66`
- Bulk progress counts (`printed`, `failed`) live inside the order record; two devices logging plates on the same order at once overwrite each other (sync is last-write-wins per record; spools were protected, orders were not). [CODE] `data/sync.ts`, `data/floor.ts:277`
- **Storage failures are silent.** Every save swallows `localStorage` errors; photos, thumbnails, logs and ~2,700 imported rows grow with no warning, no "storage full" notice. [CODE] `data/store.ts:88`
- Shared devices: signing out of the cloud wipes the device copy (good) but there is no "unsent changes" warning before it. [CODE] `data/sync.ts:562`

## 5. Not required / in the way

| Item | Why it obstructs | Tag |
|---|---|---|
| **"Record" button next to unchecked items in the order panel** (Quotation approved, PO, Build sheet, QC logged, Packing, Invoice raised, Tracking, Paid) | One tap sets the flag without doing the work; PO and tracking get **random numbers** (`PO/4821`, `TRK…`). "Invoice raised" ticked with no invoice lets the order be archived. | CODE (UI-reachable) `shared.tsx:143`, `index.ts:79` |
| **Batch rows: "Mark printed", "Add tracking", "Add batch"** | Mark printed sets done = planned with no filament, QC or log; tracking is random; new batch is hard-coded to 50 units named "Batch N". | CODE `shared.tsx:349`, `index.ts:115,130-135` |
| 14 work tabs + 3 segment pages + 9 Mauny tabs behind a dropdown | Orders / Production / QC / Packing / Shipping / Archive / Bulk batches / Quotes / Documents duplicate what the Client / Bulk / In-house pages already show; the stage strip repeats on Dashboard, Invoice and every segment. Mauny's 9 views hide behind one select. | UI |
| Native `prompt()/alert()/confirm()` (about 15 places: credit-note reason, back-stage reason, copy order by typing an id, new account name + opening balance, reset password…) | Unstyled, easy to cancel into an empty reason (credit note saves with a blank reason), poor on tablets. | CODE `grep prompt(` |
| `resequence()`, `FLOW_NOTE` (says "gated stage by stage"), `mock/data.ts` and `mock/extra.ts` (not imported anywhere) | Dead code; the gate wording is misleading because owners/managers can override any stage with a typed reason. | CODE |
| Hard-coded company bank account, GSTIN and signatory in source | Fine for printing, but any change needs a code release. | CODE `invoicing.ts:46` |
| Default login `owner@studionexify.com` / `emerald`; "reset password" sets everyone to `emerald`; 32-bit hash; local mode can be changed by editing browser storage | Only safe because cloud sign-in is the real gate. | CODE `auth.ts:23,43` |
| Role `partner` exists in the app (can issue invoices) but not in the cloud function or DB constraint (`owner, manager, operator, accountant, ca`) | A partner account cannot be created in cloud mode, so only the owner can issue invoices. Ignore if the live DB was edited by hand. | CODE `admin-users/index.ts:7`, `0001_sync.sql` |
| Database rules are org-wide, roles only enforced in the screens | Any logged-in member (including the CA) can read every record via the API, not just GST. | CODE `0001_sync.sql` |

## 6. UI / UX

- **Order panel squeezes the list** (desktop 1440): KPI strip shows `₹2,68…`, the *Due* column is cut off with no scroll. [UI] `screenshots/audit/ui-order-panel-clipped.png`
- **Phone**: no "+ New" quick-create (hidden below `md`); an invoice register row takes ~190 px so one invoice per screen; the floating bar ("Invoice settings / New invoice") covers rows; Invoice sits under the Production tab. [UI]
- Invoice PDF prints a full "Ship to" block (name, address, GSTIN) even when "same as Bill to" is ticked. Cosmetic. [UI/PDF]
- Invoice date outside the series shows number `-001` and a disabled Review button with the reason off-screen. [UI]
- Store with a few thousand spools renders every card (3,100+ controls on one page); fine at your size, slow if the library grows. [UI]
- Finance chart titled "Earned vs spent · April-first", no axis values. [UI]

## 7. What I changed (this branch)

**Mauny redesign** (`routes/MaunyHome.tsx`, `nav.ts`, `routes/Mauny.tsx`):
- **Top: 4 large cards** — Cash & bank now (with wallets), To collect, To pay, This month.
- **Second row: the jobs Mauny exists for** — Bank statements to review, GST return (**last month's** return — GSTR-1 by the 11th, GSTR-3B by the 20th, monthly filer — with a due/overdue countdown that also shows for a nil return, and an *estimated* payable/credit; turns "Filed" when the GST desk locks the month), Purchase bills to review, Year-end & ITR (days left in FY → Books / Tally / Year-end pack).
- **Quick actions**: + Expense, + Income, Transfer, Upload statement.
- **Below**: the entry form and the month's transactions, unchanged. On phone the form opens from the buttons instead of filling the first screen. "New → Money entry" still focuses the amount box.
- Tabs: "Entry" → **Overview**, "Settings" → **Statements & wallets**.
- Columns follow the space available (container queries), so with a transaction detail panel open at 1280 or 1440 the cards drop to 2 columns instead of squeezing; amounts never wrap. Checked at 1440, 1280, tablet 820, phone 390, light and dark.
- Kept: Alpha/Beta wallet filtering, per-role tab gating (accountant sees GST/Year-end cards; manager gets "No access"; CA is redirected to the GST desk — all checked), all 9 views reachable.
- Screenshots: `screenshots/audit/mauny-before-*.png`, `mauny-after-*.png` (incl. dark and detail-open).

**Deliberately not changed** — these are accounting or data-policy decisions, so I list them for you to choose rather than guess.

## 8. Decisions I need from you

1. **Short-id purge (#1):** confirm `s1…s6` are leftover sample rows (they match `mock/data.ts`) so they can be deleted from the database; and decide whether to replace the pattern rule with an explicit `demo-` prefix so a real record can never be caught.
2. **Mauny expenses (#2):** should every Mauny expense also become an expense record (so P&L/GST see it), or stay cash-only?
3. **Cancelled paid invoice (#5) / credit note (#7):** reverse the receipt automatically, or ask? Should a credit note reduce "To collect"?
4. **Statements (#3, #4):** which bank files do you actually get (CSV, XLSX, PDF)? I will build the parser to that format.
5. **Order cost (§4):** drop the 30 % guess and compute cost from recorded filament + machine + power, showing "—" until recorded?
6. **Fake "Record"/random tracking (§5):** remove them, or turn each into a real form (tracking number + courier, QC entry, packing entry)?
7. **Invoice type:** add the field? Values: Client / Bulk / B2B / In-house?

## 9. What was and was not exercised

**Exercised in the UI:** all 44 routes (desktop + phone: console errors, overflow); Mauny page at 5 sizes and 4 roles; invoice **end to end** (blank invoice → pick saved client → fields fill from the client → review → issue → PDF downloaded and read: number `B-019`, bill-to, place of supply Maharashtra, IGST 18 % = ₹360, round-off, amount in words, bank block all correct); the bad-date crash; New order; order panel; Floor sheet opens; Add spool form opens; New menu; Alpha/Beta; role gating by path.

**Exercised by calling the app's functions only (no click path run):** issue → pay → cancel, credit note, statement import and match, bill confirm, order numbering, plate start/finish, client remembering, GST window maths.

**Not exercised — treat as unreviewed:** Floor sheet start/finish through the screen; saving a spool, movements, parts, packing stock and Stock audit; Nexcal / NexRes calculators and pricing settings; To-do; Bin restore; Settings, users and roles screens; Excel invoice-book import and Emerald-1 import; quotations and documents; credit-note and transporter-copy PDFs; Print / Year-end pack / Tally XML (output not opened in Tally); **cloud sign-in and sync (read, not run)**; anything with real data.

**Checked and fine:** no console errors or overflow on 44 routes × 2 sizes; role gating by path; invoice arithmetic (CGST/SGST split, IGST, round-off) on the test invoices; draft numbers not consumed; issued invoices freeze seller details; service worker / chunk-reload handling; `tsc`, build and size budget.

---

## 10. Fixed after your answers (second pass)

| Your answer | What changed | Verified |
|---|---|---|
| 1. Delete | Sample rows (`s1…s6` and all other demo ids) are now deleted from the **cloud** as well as every device on the next sync; dead `mock/data.ts` and `mock/extra.ts` removed. | code path only (cloud not run) |
| 2. Mauny connected to Emerald | Every Mauny money-out *expense* now also creates an expense record (Finance, Books, GST, Tally see it) and, if tagged to an `EM-` order, counts in that order's cost. Statement "Confirm" marks the invoice paid (or the expense paid) and books the real amount received. | function test: ₹18,000 rent → Finance "Spent" ₹18,000 |
| 3. To collect | New `invDue()`: invoice total − credit notes − receipts. Used by To collect, Finance outstanding, Books debtors, attention, statement matching. Credit notes can't exceed the uncredited value and need a reason. Cancelling an invoice takes its payment back out of the books and un-ticks "invoiced" on the order; Mark unpaid removes any receipt for it. | ₹11,800 invoice, ₹4,000 credit → To collect ₹7,080; cancel after paying → cash back to 0 |
| 4. Statements any kind | CSV/TSV/TXT (any delimiter, quoted fields), Excel `.xlsx`, and text PDFs. Columns found by header name; Indian numbers, `(500)`, `Dr/Cr`, many date styles. Twin transactions kept; re-import skipped. `.xls`, scanned PDFs and photos get a clear message. | CSV, `;`-text, signed CSV, generated PDF tested; real bank PDFs/XLSX not available to me |
| 5. Prices in Store | New **Store → Prices** tab: filament ₹/kg per material, machine/power/labour, packing and part prices, margins. Costs now come from these (a spool's own price first). The 30 % guess is gone: order cost = recorded consumption + order expenses (else planned line cost); margin shows "—" until something is recorded; Archive splits use real figures. | cost test: new order → cost 0, margin "—" |
| 6. Real forms | The order checklist "Record" buttons open forms (approval, PO number, QC entry, packing record that draws stock, courier + tracking number + freight, payment into an account, invoice draft). Random PO/tracking numbers, "Mark printed" and the hard-coded 50-unit batch are gone; batches and dispatch are asked. | UI: QC, approval, payment saved; empty tracking refused |
| 7. Invoice type | `Invoice.type` (Client / Bulk / B2B / In-house): set from the order, chosen on blank invoices (required to issue), shown as a Register column and filter, copied to credit notes. Old invoices fall back to their order's type. | issue test |

Floor sheet printer logs: see §11. Nothing from the original top list remains open.

## 11. Floor sheet printer logs (third pass)

Completing a print on the Floor sheet (and the older order-panel "Print done") now asks for **print time** (defaults to the time since Start, editable) and writes the printer log:
- printer **lifetime hours** go up (so "next service in … h" and service alerts move);
- **job rows** are created per printer (done / failed; a run with wasted pieces splits its hours by pieces), so the printer's failure % and the failure-rate alert are real; failure % is weighted by print time;
- **machine and electricity cost** go onto the order at the Prices rates; filament uses the spool's own ₹/kg;
- multi-printer runs ("A + B") log each printer; **undoing a run reverses all of it**.

Test (function level): 10 pieces, 2 wasted, 3 h on a printer at 100 h → printer 103 h, jobs done 2.4 h + failed 0.6 h, failure 20 %, order cost ₹189 (filament ₹90 + machine ₹75 + power ₹24); undo → back to 100 h, no jobs, no consumption. Not tested by clicking the new "Print time" field on screen. Runs logged with "already printed" (no Start) have no printer or time and still log nothing to a printer.

## 12. Date bug and invoice-date crash (fourth pass)

- **Dates now use India's local calendar day**, not UTC (`today()`, time stamps, order/quote/shipment dates, Dashboard week chart, quote validity, Bin expiry, forecast dates). Test with the clock at 01:30 IST on 1 Apr 2027: today = `2027-04-01`, next invoice `C-001` (before: `2027-03-31`, `B-019`).
- **"Last month" window** is now 1–31 Oct (was 30 Sep–30 Oct). **Mauny month arrows** skipped a month in IST (November → September); now November → October → September.
- **Invoice date crash fixed.** A date with no series (before 1 Apr 2025, a half-typed year, or cleared) no longer throws: the number shows "—", the draft says "Date: invoices are numbered from 1 Apr 2025 … pick a valid date", and Review stays disabled. A draft saved with such a date reopens normally after reload (UI test, no errors).
- Pure date-string arithmetic (MSME 45 days, day-book arrows) was already time-zone safe and is unchanged. Heartbeat still uses UTC on purpose.

## 13. `fixKnownInvoices` (fifth pass)

It is now a **one-time migration**: it runs once (only when invoices exist), applies the B-015 (₹42,000 → ₹43,000), B-017 (CGST + SGST) and missing-address corrections, writes one log line naming each change, records `known-invoice-fixes-1` in a synced "migrations" list, and never runs again — on any device. Test: first open applied both fixes and logged once; after resetting B-015 to ₹42,000 and reopening, it stayed ₹42,000. If those two invoices were already corrected in your live data, the run changes nothing and just switches itself off. Caveat: if a device opens Invoice before cloud data has arrived, it could mark the migration done without finding B-015/B-017; in that case fix them by hand once.

## 14. Everything else that was pending (sixth pass)

Verified at function level (headless browser, IST) unless marked; screenshots `screenshots/audit/daybook-labels.png`, `gst-desk-filing.png`, `prompt-dialog.png`.

- **Day book labels.** Columns are now "Money out (Cr)" and "Money in (Dr)"; the form fields say "Money out ₹" / "Money in ₹". [UI]
- **GST desk.** GSTR-1 and GSTR-3B are marked filed separately; "Lock month" is enabled only when both are done; the table and the Mauny card show partial status ("GSTR-1 filed, 3B in n d"). Net payable now carries unused ITC forward month to month ("ITC brought forward" shown). ITC counts only bills with a vendor GSTIN (others are flagged "Bills without vendor GSTIN"). Purchases from a vendor GSTIN outside Gujarat (state code ≠ 24) are IGST, not CGST+SGST (test: 0 / 0 / 180). [FN + UI]
- **Locked months.** Issuing an invoice dated in a filed-and-locked GST month is refused with a clear message. [FN]
- **Name-only client merge.** Two "Rahul Shah" in different states are now two clients (GSTIN decides when both have one; otherwise name + non-clashing state). Autofill picks the matching state. [FN]
- **Walk-in bills.** Address is required only for GST customers or bills of ₹50,000 and above; state is still required. [FN]
- **Duplicate invoice numbers** (two devices issuing offline) now raise an Attention item telling the owner to cancel one and re-issue. Prevention across devices still needs a server-side counter — not built. [CODE]
- **Storage full / blocked.** A red banner appears when the browser refuses to save, instead of failing silently. [CODE]
- **New order** can no longer be saved empty: customer, item, quantity and unit price are checked; the dead "GSTIN" box on Bulk orders was removed. [CODE]
- **Native prompt/confirm/alert** (14 places) replaced with the in-app dialog (new `askText` for typed answers; password field masked). [UI]
- **Loans.** A loan-repayment entry now reduces the loan it was paid against (lender in the note, else the oldest open loan) so interest stops on the repaid part. [FN]
- **Tally XML.** Salaries, rent and other non-goods expenses are Payment vouchers; filament/packing/courier stay Purchase vouchers with an Input GST line. Not imported into a real Tally. [FN]
- **CSV exports** prefix text starting with = + - @ so Excel cannot run it as a formula. [FN]
- **Partner role in the cloud.** `admin-users` accepts `partner`; new migration `supabase/migrations/0004_partner_role.sql` widens the DB check. **The migration and function are not deployed yet — run/deploy them.** [CODE]

Not changed, on purpose or not possible here:
- Floor "already printed" plates still log nothing to a printer — there is no printer to attribute them to.
- Org-wide row access (every signed-in member can read/write every record; roles are enforced in the UI only) is a database-policy redesign, not a quick fix.
- Cross-device invoice number counter, cloud sync, real bank XLSX/PDF files, Tally import: untested.
- Not reviewed: To-do, Bin restore, Settings/users, Excel invoice-book and E1 import.

## 15. The rest (seventh pass)

- **Role rules now enforced by the database** (`app/supabase/migrations/0005_role_rules_and_invoice_counter.sql`). Until now any signed-in member could read and write every record; roles lived only in the screens. Now: money books (money, statement, accounts, opening, loans, assets, goals) are readable/writable by owner, partner and accountant only; users/business/settings by owner and partner only; invoices by owner, partner, accountant; GST filed flags also by the CA; the CA reads only invoices, bills, expenses, GST flags, business and HSN; shop data (orders, stock, clients…) stays open to every role except the CA (read-only). Inactive members are locked out entirely. **Tested** in an in-memory Postgres with stubbed Supabase auth (manager blocked from money, accountant blocked from users, CA limited, counter correct); **not run against your live Supabase.** [FN, not live]
- **Refused writes no longer jam sync.** If the server refuses a row for the signed-in role, the app retries row by row, drops only the refused ones and shows an amber banner naming the record types. [CODE]
- **Invoice numbers can no longer clash across devices.** New server counter (`claim_invoice_no`): when online, issuing takes the next number from the shared counter; offline it falls back to the local number and the duplicate warning from §14 still catches clashes. Local fallback tested; the online path needs the migration deployed. [CODE]
- **Real bank files tested.** An .xlsx statement (HDFC-style, with a header preamble, date cells, blank debit/credit cells) **crashed the reader** — fixed (Excel rows have holes). A text PDF made by a PDF library read correctly after adding ASCII85 support. Scanned PDFs, photos and bank PDFs with embedded-font encodings still give the "download the CSV/Excel instead" message. [FN]
- **Excel invoice-book import:** invoices it creates now carry an internal type (B2B when the client has a GSTIN, else Client). Reviewed; not run on your real workbook. [CODE]
- **Bin:** deleting the newest order and creating another reused its number (EM-1001 twice after a restore). New orders now count Bin numbers. Tested. [FN]
- **Settings → Team:** the last active owner can no longer be retired or demoted (that locked everyone out of Settings). [FN]
- **To-do reviewed, no changes:** tasks link to orders/clients by number/name, so renaming a client breaks that link; "Assigned to me" matches by name. Minor.
- **Floor "already printed"** left as is: it records counts only because it has no printer to attribute hours to.

**To deploy:** run `0004_partner_role.sql` then `0005_…sql` in the Supabase SQL editor, and deploy the `admin-users` function. Do the migration before relying on roles; after it, a manager's attempt to edit money books is refused by the server. Not tested: live sync, Tally import, scanned/font-encoded PDFs.
