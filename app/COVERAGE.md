# Emerald 2.0 — coverage vs EMERALD-DOCUMENTATION-LATEST2.md

Status: **Done** = works in the prototype (saved on this device). **DB** = needs the database/server and is deferred by decision.

| Spec section | Status | Notes |
|---|---|---|
| Visual language, typography, frame | Done | Inter, weight hierarchy, fixed shell, no page scroll |
| Identity & roles (incl. CA) | Done | Team & users merged; login toggle; role matrix. Real auth = DB |
| Pipeline engine | Done | No gates (owner decision); any stage, logged |
| Orders & quotations | Done | Board/list, new order, from template, quote register |
| Production floor | Done | Jobs open → start, done (draws spool + machine + power), fail (scrap), reprint; build sheet |
| QC & logging | Done | Queue, defect + root cause taxonomy, scrap logged, entries open/edit |
| Packing & shipping | Done | Multi-line packing draws stock; partial dispatch; tracking editable |
| Archive & cost rollup | Done | Rows open order detail, reopen |
| Inventory & workshop | Done | Printers, spools (gross/tare/net weigh-in, colour, brand, lot, storage, temps, load on printer, dried), accessories, parts, packing, stock ledger, retire/delete→Bin |
| Pricing calculator | Done | FDM/resin, settings, "Use in quotation" creates an order |
| Finance & expenses | Done | Five figures, expenses, outstanding, receipts; rows open |
| Purchases (bill vault) | Done (mock) | Drive upload + AI reading = DB/server |
| Goals | Done | |
| Reports | Done | |
| Attention engine | Done | |
| Documents & generator | Done | Print / save PDF |
| Storefront sync (Shopify) | DB | Needs OAuth + webhooks |
| The Bin | Done | Delete → Bin → restore / delete forever |
| Books, GST desk, Mauny | Done | Tally XML, year-end pack, CA desk |
| Supabase persistence, multi-device | DB | Everything currently saved per device |
