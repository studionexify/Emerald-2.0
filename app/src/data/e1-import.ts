/** Emerald 1 → 2.0 migration: map the live-data export onto 2.0's records, then replace the local store with it.
 *  Nothing here talks to the old database — the export files are the only input. */
import { parseExport, type Row, type Tables } from "./e1-parse";
import type { Batch, BatchStage, Binned, Job, Log, Movement, Order, PackItem, PackRecord, Printer, QcEntry, Spool, SpoolStatus, Stage, Task } from "../mock/types";
import type { Account, Asset, Bill, Expense, Goal, GoalMetric, Invoice, InvLine, MoneyEntry, MoneyKind, Quote, Shipment } from "./ledger";
import type { Client } from "./inventory";
import type { Biz } from "./biz";

const num = (v: unknown, d = 0) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : d; };
const str = (v: unknown) => (v == null ? "" : String(v));
const day = (v: unknown) => str(v).slice(0, 10);
const json = <T>(v: unknown, d: T): T => { if (v == null) return d; if (typeof v !== "string") return v as T; try { return JSON.parse(v); } catch { return d; } };
const bool = (v: unknown) => v === true || v === "true";
const r2 = (n: number) => Math.round(n * 100) / 100;
const HOME = /gujarat|vadodara|^24$/i;
/** GST is 18% on every Emerald 1 invoice; `amount` is the GST-inclusive total. */
const GST = 18;

export type Migrated = {
  clients: Client[]; invoices: Invoice[]; quotes: Quote[]; orders: Order[]; batches: Batch[]; jobs: Job[]; qc: QcEntry[];
  packRecords: PackRecord[]; shipments: Shipment[]; printers: Printer[]; spools: Spool[]; packStock: PackItem[]; accessories: PackItem[];
  movements2: Movement[]; expenses: Expense[]; bills: Bill[]; accounts: Account[]; money: MoneyEntry[]; assets: Asset[]; goals: Goal[];
  tasks: Task[]; logs: Log[]; rates: Record<string, number>; nexcal?: Record<string, unknown>; nexres?: Record<string, unknown>; bin: Binned[]; team: { id: string; name: string; job: string; active: boolean }[]; business?: Partial<Biz>;
};

const STAGE: Record<string, Stage> = { quotation: "quotation", production: "production", qc: "qc", packing: "packing", invoice: "invoice", shipping: "shipping", archived: "archived", po: "po" };
const KIND: Record<string, MoneyKind> = { customer_receipt: "receipt", customer_advance: "advance", expense: "expense", other_income: "other_income", refund_received: "other_income", capital_in: "capital_in", drawings: "drawings", tax_payment: "tax_payment", customer_refund: "expense", asset_purchase: "asset_purchase", loan_taken: "loan_taken", loan_repayment: "loan_repayment" };
const METRIC: Record<string, GoalMetric> = { revenue: "revenue", collection: "collection", cash_collected: "collection", profit: "profit", expense_cap: "expense_cap", spend_cap: "expense_cap", orders: "orders", orders_closed: "orders", margin_pct: "margin_pct", avg_margin: "margin_pct", custom: "custom" };

export function mapEmerald1(t: Tables): Migrated {
  const T = (k: string): Row[] => t[k] ?? [];
  const machines = new Map(T("machines").map((m) => [str(m.id), str(m.name)]));
  const lineById = new Map(T("order_line_items").map((l) => [str(l.id), l]));
  const accountOf = (mode: unknown) => (/cash/i.test(str(mode)) ? "cash" : "bank_current");

  const clients: Client[] = T("clients").map((c) => ({
    id: str(c.id), name: str(c.name), kind: c.gstin || c.party_type === "store" ? "Business" : "Individual", phone: str(c.contact), email: str(c.email) || undefined,
    city: str(c.place_of_supply), address: str(c.bill_address) || undefined, gstin: str(c.gstin), medium: c.party_type === "store" ? "Store" : "", active: true,
  }));

  const invoices: Invoice[] = T("invoices").map((i) => {
    const raw = json<{ hsn?: string; qty?: number; unit_price?: number; description?: string }[]>(i.line_items, []);
    const total = num(i.amount);
    const lines: InvLine[] = raw.length ? raw.map((l) => ({ desc: str(l.description), hsn: str(l.hsn), qty: num(l.qty, 1), rate: num(l.unit_price) }))
      : [{ desc: "As invoiced (Emerald 1)", hsn: "", qty: 1, rate: r2(total / (1 + GST / 100)) }];
    const pos = str(i.place_of_supply);
    return {
      id: str(i.invoice_number), kind: "invoice", no: str(i.invoice_number), date: day(i.issued_date), customer: str(i.customer_name), gstin: str(i.bill_gstin) || undefined,
      address: str(i.bill_address) || undefined, orderNo: str(i.order_id) || undefined, lines, gstRate: GST, interstate: !!pos && !HOME.test(pos),
      status: i.cancelled_at ? "cancelled" : "issued", paidOn: i.status === "paid" ? day(i.paid_date || i.issued_date) : undefined,
      paidAccount: i.status === "paid" ? accountOf(i.payment_mode) : undefined, note: str(i.cancel_reason) || undefined, shipTo: str(i.ship_address) || undefined, contact: str(i.bill_contact) || undefined, pos: pos || undefined,
    };
  });

  const quotes: Quote[] = T("quotations").map((q) => ({
    id: str(q.quote_number), no: str(q.quote_number), date: day(q.issued_date), customer: str(q.customer_name) || "—", address: str(q.address) || undefined, orderNo: str(q.order_id) || undefined,
    lines: [{ desc: "As quoted (Emerald 1)", hsn: "", qty: 1, rate: r2(num(q.amount) / (1 + GST / 100)) }], gstRate: GST, valid: day(q.valid_until_date) || day(q.issued_date),
    outcome: q.status === "approved" ? "approved" : q.status === "lost" || q.status === "rejected" ? "lost" : q.status === "sent" ? "open" : "unrecorded",
  }));

  const orders: Order[] = T("orders").map((o) => {
    const items = T("order_line_items").filter((l) => l.order_id === o.id).map((l) => {
      const spec = json<{ colour?: string }>(l.spec, {});
      return { name: str(l.product_name) || "Item", material: str(l.material) || "PLA", colour: str(spec.colour), qty: num(l.qty, 1), price: num(l.unit_price), cost: 0 };
    });
    const stage = STAGE[str(o.status)] ?? "quotation";
    const done = stage === "archived";
    return {
      id: str(o.id), no: str(o.id), type: o.order_kind === "internal" ? "inhouse" : "client", customer: str(o.customer_ref) || (o.order_kind === "internal" ? "Studio Nexify" : "—"),
      medium: str(o.source_medium) || (o.order_kind === "internal" ? "Internal" : ""), stage, created: day(o.created_at), due: day(o.target_date || o.created_at), items,
      approved: !!o.approved_at || done, jobsDone: done, qcLogged: done, packed: done, invoiced: invoices.some((i) => i.orderNo === o.id),
      delivery: o.address ? { method: "courier", address: str(o.address) } : undefined,
    };
  });
  for (const b of T("bulk_orders")) {
    const lines = json<{ name?: string; qty?: number; price?: number | null }[]>(b.lines, []);
    orders.push({ id: str(b.id), no: str(b.id), type: "bulk", customer: str(b.party_name), medium: str(b.deal_type), stage: b.status === "closed" ? "archived" : "production",
      created: day(b.order_date || b.created_at), due: day(b.order_date || b.created_at), items: lines.map((l) => ({ name: str(l.name), material: "PLA", colour: "", qty: num(l.qty, 1), price: num(l.price), cost: 0 })),
      approved: true, invoiced: !!b.invoice_number });
  }
  const bulkName = (oid: string, lid: string) => json<{ id: string; name: string }[]>(T("bulk_orders").find((b) => b.id === oid)?.lines, []).find((l) => l.id === lid)?.name ?? "Batch";
  const batches: Batch[] = T("bulk_print_batches").map((b) => ({
    id: str(b.id), orderNo: str(b.order_id), customer: str(T("bulk_orders").find((o) => o.id === b.order_id)?.party_name), name: bulkName(str(b.order_id), str(b.line_id)),
    units: num(b.good) + num(b.failed), done: num(b.good), stage: (b.status === "done" ? "qc" : "production") as BatchStage,
  }));

  const jobs: Job[] = T("production_jobs").map((j) => {
    const line = lineById.get(str(j.order_line_item_id));
    const hrs = j.start_time && j.end_time ? Math.max(0, (Date.parse(str(j.end_time)) - Date.parse(str(j.start_time))) / 36e5) : 0;
    return { id: str(j.id), orderNo: str(line?.order_id), item: str(line?.product_name), printer: machines.get(str(j.machine_id)) ?? str(j.machine_id), operator: str(j.operator),
      status: j.print_status === "success" ? "done" : j.print_status === "failed" ? "failed" : j.print_status === "running" ? "printing" : "queued", hours: r2(hrs), grams: num(j.material_used) };
  });
  const qc: QcEntry[] = T("qc_records").map((q) => ({ id: str(q.id), orderNo: str(q.order_id), item: str(lineById.get(str(q.line_item_id))?.product_name), result: (["pass", "rework", "scrap"].includes(str(q.result)) ? q.result : "pass") as QcEntry["result"],
    grams: num(q.wastage_g), defect: str(q.defect_tag) || undefined, by: str(q.checked_by), date: day(q.timestamp) }));
  const packRecords: PackRecord[] = T("packing_records").map((p) => ({ id: str(p.id), order: str(p.order_id), box: str(p.box_dimensions), weight: p.gross_weight_g ? `${p.gross_weight_g} g` : "",
    materials: bool(p.no_packaging) ? "No packaging" : json<{ name?: string; qty?: number }[]>(p.materials, []).map((m) => `${m.name} ×${m.qty}`).join(", "), cost: 0, by: str(p.packed_by), notes: str(p.special_notes), date: day(p.packed_at) }));
  const shipments: Shipment[] = T("shipments").map((s) => ({ id: str(s.id), orderNo: str(s.order_id), date: day(s.dispatched_at), courier: str(s.courier), service: str(s.service), tracking: str(s.tracking_number),
    lines: json<{ name: string; qty: number }[]>(s.lines, []), freightPaid: num(s.shipping_cost), freightRecovered: num(s.charged_to_customer), eta: day(s.expected_delivery) }));

  const printers: Printer[] = T("machines").map((m) => ({ id: str(m.id), name: str(m.name), model: str(m.model), status: "idle", hours: r2(jobs.filter((j) => j.printer === m.name).reduce((a, j) => a + j.hours, 0)), active: bool(m.active) }));
  const spools: Spool[] = T("spools").map((s) => {
    const net = num(s.net_g), tare = num(s.tare_g);
    const status: SpoolStatus = s.status === "empty" || net <= 0 ? "empty" : s.status === "sealed" ? "sealed" : "open";
    return { id: str(s.id), material: str(s.material_type), colour: str(s.colour), brand: str(s.brand), grams: net, size: num(s.spool_size_g, 1000), spoolNo: str(s.spool_no) || str(s.id),
      tare, gross: net + tare, costKg: s.cost_per_g != null ? r2(num(s.cost_per_g) * 1000) : undefined, bought: day(s.received_at), lot: str(s.batch_number) || undefined,
      status, weighed: day(s.last_weighed_at) || undefined, notes: str(s.note) || undefined, active: status !== "empty" };
  });
  const piece = (rows: Row[], cat?: string): PackItem[] => rows.map((p) => ({ id: str(p.id), name: str(p.name), unit: str(p.unit) || "pcs", qty: num(p.current_stock), reorderAt: num(p.reorder_threshold), cost: num(p.unit_cost), active: true, cat }));
  const movements2: Movement[] = T("stock_movements").map((m) => ({ id: str(m.id), date: day(m.date), cat: str(m.category), item: str(m.item_name), dir: m.direction === "out" ? "out" : "in", qty: num(m.qty), unit: str(m.unit),
    unitCost: num(m.unit_cost), vendor: str(m.vendor), colour: str(m.colour) || undefined, brand: str(m.brand) || undefined, notes: [m.reason, m.notes].filter(Boolean).join(" · ") || undefined, by: str(m.logged_by) }));

  const expenses: Expense[] = T("expenses").map((e) => {
    const me = T("money_entries").find((m) => m.expense_id === e.id);
    return { id: str(e.id), date: day(e.date), head: str(e.category) || "Other", vendor: str(e.vendor), amount: num(e.amount), tax: num(e.tax_amount), billId: str(e.document_id) || undefined,
      paid: e.status === "paid", account: me ? str(me.account_id) : undefined };
  });
  const bills: Bill[] = T("purchase_documents").map((d) => {
    const x = json<any>(d.extracted, {});
    return { id: str(d.id), vendor: str(x.vendor), gstin: str(x.vendor_gstin) || undefined, no: str(x.bill_number), date: day(x.bill_date || d.uploaded_at), subtotal: num(x.subtotal), tax: num(x.tax_amount), total: num(x.total),
      cat: str(x.category) || "Other", status: (["needs_review", "logged", "failed", "rejected"].includes(str(d.status)) ? d.status : "needs_review") as Bill["status"], note: str(d.note) || str(d.file_name),
      file: str(d.drive_view_link) || undefined, fy: str(d.drive_folder) || undefined, lines: (x.lines ?? []).map((l: any) => ({ desc: str(l.description), amount: num(l.amount), qty: l.qty != null ? num(l.qty) : undefined, unit: str(l.unit) || undefined })), stockApplied: d.stock_applied_at ? day(d.stock_applied_at) : undefined };
  });
  const accounts: Account[] = T("money_accounts").map((a) => ({ id: str(a.id), name: str(a.name) + (a.number_last4 ? ` ··${a.number_last4}` : ""), opening: num(a.opening_balance) }));
  const money: MoneyEntry[] = T("money_entries").map((m) => {
    const out = m.direction === "out";
    const kind: MoneyKind = m.kind === "transfer" ? (out ? "transfer_out" : "transfer_in") : KIND[str(m.kind)] ?? (out ? "expense" : "other_income");
    return { id: str(m.id), date: day(m.date), account: str(m.account_id), kind, amount: out ? -num(m.amount) : num(m.amount), note: str(m.counterparty) || str(m.narration),
      ref: str(m.expense_id || m.order_id || m.asset_id || m.reference) || undefined, pair: str(m.transfer_pair_id) || undefined, source: str(m.source) || undefined };
  });
  const assets: Asset[] = T("fixed_assets").map((a) => ({ id: str(a.id), name: str(a.name), machine: machines.get(str(a.machine_id)) ?? "—", block: a.block === "plant" ? "Plant & machinery" : str(a.block),
    blockRate: num(a.rate, 15), cost: num(a.cost), date: day(a.in_use_from || a.purchased_on) }));
  const goals: Goal[] = T("goals").map((g) => {
    const start = day(g.start_date || g.created_at), end = day(g.deadline_date) || `${num(g.fy_start_year) + 1}-03-31`;
    return { id: str(g.id), title: str(g.title), metric: METRIC[str(g.metric)] ?? "custom", start: start > end ? end : start, end, period: str(g.period), target: num(g.target),
      manual: g.manual_progress != null ? num(g.manual_progress) : undefined, note: str(g.note), archived: bool(g.archived) };
  });
  const tasks: Task[] = T("todos").map((x) => ({ id: str(x.id), title: str(x.title), due: day(x.due_date || x.my_day_date || x.created_at), done: !!x.completed_at, who: str(x.assigned_to),
    notes: str(x.description) || undefined, priority: x.priority && x.priority !== "none" ? str(x.priority) : undefined, link: x.order_id ? { kind: "order", ref: str(x.order_id) } : undefined }));
  const logs: Log[] = T("activity_log").map((a) => ({ id: `al-${a.id}`, at: str(a.at).slice(0, 16).replace("T", " "), who: str(a.actor), action: str(a.summary) || `${a.action} ${a.entity}`, target: str(a.entity_id),
    kind: /invoice|money|bank|expense/.test(str(a.entity)) ? "money" : /spool|stock/.test(str(a.entity)) ? "stock" : "order" }));
  const BINKIND: Record<string, string> = { spool: "Spool", client: "Client", todo: "Task", machine: "Printer" };
  const bin: Binned[] = T("deleted_records").map((b) => ({ id: str(b.id), kind: BINKIND[str(b.kind)] ?? str(b.kind), label: str(b.label), deletedAt: day(b.deleted_at), by: str(b.deleted_by), data: undefined }));
  const team = T("team_members").map((m) => ({ id: str(m.id), name: str(m.name), job: str(m.job_title), active: bool(m.active) }));

  // Rates: material ₹/g → ₹/kg, Nexcal labour/margin/power/efficiency, machine ₹/h from the printer's cost spread over its uptime.
  const setting = (k: string) => json<any>(T("app_settings").find((x) => x.key === k)?.value, null);
  const nx = setting("nexcal_settings"), nr = setting("nexres_settings");
  const rates: Record<string, number> = {};
  for (const m of T("materials")) { const k = str(m.material_type).toLowerCase(); if (["pla", "petg", "abs", "tpu"].includes(k)) rates[k] = r2(num(m.cost_per_unit) * 1000); }
  if (nx) {
    const hrs = 8760 * (num(nx.estimatedUptimePct, 50) / 100);
    rates.machine = r2(((num(nx.printerCost) + num(nx.additionalUpfrontCost) + num(nx.annualMaintenance) * num(nx.estimatedLifeYrs, 3)) / (num(nx.estimatedLifeYrs, 3) * hrs)) * num(nx.costBufferFactor, 1));
    rates.labour = num(nx.labourHourlyRate, 200); rates.margin = num(nx.defaultMarginPercent, 65); rates.gst = num(nx.gstPercent, 18);
    rates.power = r2((num(nx.powerConsumptionW, 200) / 1000) * num(nx.electricityCost, 8)); rates.efficiency = num(nx.materialEfficiencyFactor, 1.25);
  }
  if (nr?.settings) {
    const st = nr.settings; rates.resinMargin = num(st.defaultMarginPercent, 65);
    const std = (st.resins ?? []).find((r: any) => /standard/i.test(r.name)); if (std) rates.resin = num(std.priceL);
    rates.resinMachine = r2(num(st.machineCost) / Math.max(1, num(st.machineLife, 4000)) + num(st.lcdCost) / Math.max(1, num(st.lcdLife, 2000)));
  }

  const seller = [...T("invoices")].reverse().map((i) => json<any>(i.seller, null)).find(Boolean);
  const business: Partial<Biz> | undefined = seller ? { name: str(seller.companyName) || "Studio Nexify", gstin: str(seller.gstin), pan: str(seller.gstin).slice(2, 12), phone: str(seller.companyPhone), email: str(seller.companyEmail),
    address: str(seller.companyAddressFull), bank: `${seller.bankName} · A/C ${seller.bankAccNo} · IFSC ${seller.ifsc} · UPI ${seller.upi}`, series: "A-### (FY 25-26) · B-### (FY 26-27)",
    website: str(seller.companyWebsite), addressShort: str(seller.companyAddressShort), upi: str(seller.upi), upiNumber: str(seller.upiNumber), bankName: str(seller.bankName), accName: str(seller.bankAccName), accNo: str(seller.bankAccNo), ifsc: str(seller.ifsc), jurisdiction: "Vadodara, Gujarat" } : undefined;

  return { clients, invoices, quotes, orders, batches, jobs, qc, packRecords, shipments, printers, spools, packStock: piece(T("packing_materials")),
    accessories: [...piece(T("accessories"), "Accessory"), ...piece(T("machine_parts"), "Part")], movements2, expenses, bills, accounts, money, assets, goals, tasks, logs, bin, team, business, rates, nexcal: nx ?? undefined, nexres: nr?.settings ?? undefined };
}

/** Counts per record type, for the confirm step. */
export const summarise = (m: Migrated) => Object.entries(m).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length] as const);

export const readExport = async (files: File[]) => parseExport(await Promise.all(files.map((f) => f.text())));
