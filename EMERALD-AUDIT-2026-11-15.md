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
| 1 | **Records with short ids are deleted on every load.** `purgeSample()` treats any id matching `^[a-z]{1,3}\d{1,3}$` (`s1`, `c12`, `o7`) as sample data, removes it and syncs the deletion; `applyRemote` also refuses to load them. Test: a spool `s1` and client `c1` were gone after reload. Your own `spool-recovery-report.md` lists in-stock spools `s1,s2,s3,s5,s6` (bought 2026-10-12) — **if those are real, the app cannot show them**. Real E1-import ids (`SP-…`, UUIDs) are safe; only short ids are hit. | FN | `data/store.ts:109-117`, `data/index.ts:139` |
| 2 | **Expenses entered on Mauny's Entry screen never reach Books.** They are only written to the cash ledger. After a ₹18,000 "Rent" entry: cash out −18,000, Finance "Spent" 0, Books P&L indirect expenses 0. Dashboard profit, P&L, GST ITC and the Tally export all miss them. Only the Finance → "Add expense" form and bill confirmation create expense records. | FN | `routes/MaunyHome.tsx` save → `ledger.ts:179 addMoney` (no `Expense`) |
| 3 | **Bank-statement "Confirm" never marks the invoice paid.** It looks for the old number format `B/12-34/2025`; today's numbers are `B-019`. Result: the line is booked as *Other income* and the invoice stays unpaid — revenue counted twice. | FN | `ledger.ts:228` |
| 4 | **Statement CSV parsing is wrong for Indian bank files.** `"1,25,000.00"` is read as `1`; two identical same-day UPI payments are collapsed as duplicates and one is dropped. Columns are fixed to `date, narration, debit, credit`. The file picker also accepts `.pdf/.xlsx` but only CSV works (the "server reads it" path does not exist). | FN + UI | `ledger.ts:198-210`, `routes/Mauny.tsx:316` |
| 5 | **Cancelling a paid invoice keeps the money receipt.** Cash balance still includes it; the order stays "invoiced". | FN | `ledger.ts:112` |
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
- Part payments are accepted on Mauny Entry, but the register, debtors and "To collect" use the full invoice amount; TDS is only used in statement matching, not in payment. [CODE]
- Loans: interest is charged for a full year on any open balance; repayments do not reduce the loan (only `loan_taken` is handled). Balance sheet has a "suspense" plug. [CODE] `books.ts:31`, `ledger.ts:179-183`
- Tally XML: purchase vouchers carry no GST ledgers; every expense (salaries, rent) is exported as a *Purchase* voucher. [CODE] `books.ts:102`
- Every expense must be given a "For" (order / in-house / other) before saving; a quick entry takes an extra tap each time. [UI]
- Exports are CSV without formula-injection protection (a client named `=…` runs in Excel). Low. [CODE]

## 4. Operations — printers, filament, orders

- **Printer logs are not fed by the Floor sheet.** A plate run (start → finish) left printer lifetime hours unchanged (100 → 100), created no job rows, so the printer's failure %, "next service in … h" and the failure-rate alert never move; only filament is recorded (no machine hours, no electricity). Only the older Production-page jobs update machine/power cost. [FN] `data/floor.ts:302-329`, `routes/work/Stages.tsx:32`, `data/inventory.ts` `machineStats`
- **Order cost is fiction.** New orders get `cost = price × 30 %`; the Archive page then splits it 45/30/25 % into Material/Machine/Pack. Test: 50 × ₹100 order has cost ₹1,500 while real consumption was ₹75. Dashboard shows "70 % margin" and the order panel "100 % margin" when nothing is recorded. [FN + UI] `data/index.ts:126`, `routes/work/Stages.tsx:291-293`
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
- Invoice date outside the series shows number `-001` and a disabled Review button with the reason off-screen. [UI]
- Store with a few thousand spools renders every card (3,100+ controls on one page); fine at your size, slow if the library grows. [UI]
- Finance chart titled "Earned vs spent · April-first", no axis values. [UI]

## 7. What I changed (this branch)

**Mauny redesign** (`routes/MaunyHome.tsx`, `nav.ts`, `routes/Mauny.tsx`):
- **Top: 4 large cards** — Cash & bank now (with wallets), To collect, To pay, This month.
- **Second row: the jobs Mauny exists for** — Bank statements to review, GST return (this month's return with due-in/overdue days; 3B payable and month-so-far), Purchase bills to review, Year-end & ITR (days left in FY → Books / Tally / Year-end pack).
- **Quick actions**: + Expense, + Income, Transfer, Upload statement.
- **Below**: the entry form and the month's transactions, unchanged. On phone the form opens from the buttons instead of filling the first screen. "New → Money entry" still focuses the amount box.
- Tabs: "Entry" → **Overview**, "Settings" → **Statements & wallets**.
- Kept: Alpha/Beta wallet filtering, per-role tab gating (accountant sees GST/Year-end cards; manager gets "No access"; CA is redirected to the GST desk — all checked), all 9 views reachable.
- Screenshots: `screenshots/audit/mauny-before-*.png`, `mauny-after-*.png`.

**Deliberately not changed** — these are accounting or data-policy decisions, so I list them for you to choose rather than guess.

## 8. Decisions I need from you

1. **Short-id purge (#1):** are `s1…s6` real spools? If yes, remove the rule or limit it to ids with the demo prefix; if no, it can stay.
2. **Mauny expenses (#2):** should every Mauny expense also become an expense record (so P&L/GST see it), or stay cash-only?
3. **Cancelled paid invoice (#5) / credit note (#7):** reverse the receipt automatically, or ask? Should a credit note reduce "To collect"?
4. **Statements (#3, #4):** which bank files do you actually get (CSV, XLSX, PDF)? I will build the parser to that format.
5. **Order cost (§4):** drop the 30 % guess and compute cost from recorded filament + machine + power, showing "—" until recorded?
6. **Fake "Record"/random tracking (§5):** remove them, or turn each into a real form (tracking number + courier, QC entry, packing entry)?
7. **Invoice type:** add the field? Values: Client / Bulk / B2B / In-house?

## 9. Checked and fine

No console errors or overflow on 44 routes × 2 sizes; role gating by path; GST arithmetic (CGST/SGST split, round-off, interstate) on the test invoices; draft numbers not consumed; issued invoices freeze seller details; Alpha/Beta view; service worker / chunk-reload handling; `tsc`, build and size budget.
