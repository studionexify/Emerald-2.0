/** Replace this device's records with an Emerald 1 migration. Synced like any other edit once the cloud is on. */
import { batch } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { batchesSig, consSig, logsSig, ordersSig } from "./index";
import { binSig, clientsSig, itemsSig, jobsSig, movesSig, packRecSig, packSig, printersSig, qcSig, spoolsSig, tasksSig } from "./inventory";
import { accountsSig, assetsSig, openingSig, billsSig, expensesSig, goalsSig, historySig, invoicesSig, loansSig, moneySig, quotesSig, shipmentsSig, statementSig, gstSig } from "./ledger";
import { usersSig } from "./auth";
import { bizSig } from "./biz";
import { ratesSig } from "./rates";
import { nexcalSig, nexresSig } from "./pricing";
import type { Migrated } from "./e1-import";

/** Marks the store as real data: sample rows are never merged back in on a seed-version bump. */
export const E1_FLAG = "emerald:e1";

/** Merge an Emerald 1 export into what is already here: records you have edited, added or deleted in 2.0 are kept as they are;
 *  only records that are new in the export are added. Existing orders and batches gain print counts (printed / wasted) they lack. */
export function mergeEmerald1(m: Migrated) {
  const gone = new Set(binSig.value.flatMap((b) => [b.id, (b.data as { id?: string } | undefined)?.id].filter(Boolean) as string[]));
  const add = <T extends { id: string }>(s: Signal<T[]>, incoming: T[]) => {
    const have = new Set(s.value.map((x) => x.id));
    const fresh = incoming.filter((x) => !have.has(x.id) && !gone.has(x.id));
    if (fresh.length) s.value = [...s.value, ...fresh];
    return fresh.length;
  };
  const added: Record<string, number> = {};
  batch(() => {
    // Fill missing print counts on orders already here (matched by id, then line name). Values typed in 2.0 win.
    const byId = new Map(m.orders.map((o) => [o.id, o]));
    ordersSig.value = ordersSig.value.map((o) => {
      const src = byId.get(o.id); if (!src) return o;
      let touched = false;
      const items = o.items.map((i) => {
        const si = src.items.find((x) => x.name.trim().toLowerCase() === i.name.trim().toLowerCase());
        if (!si || (i.printed !== undefined && i.failed !== undefined)) return i;
        touched = true;
        return { ...i, printed: i.printed ?? si.printed, failed: i.failed ?? si.failed };
      });
      return touched ? { ...o, items } : o;
    });
    const bById = new Map(m.batches.map((b) => [b.id, b]));
    batchesSig.value = batchesSig.value.map((b) => (b.failed === undefined && bById.get(b.id)?.failed !== undefined ? { ...b, failed: bById.get(b.id)!.failed } : b));

    added.clients = add(clientsSig, m.clients); added.invoices = add(invoicesSig, m.invoices); added.quotes = add(quotesSig, m.quotes);
    added.orders = add(ordersSig, m.orders); added.batches = add(batchesSig, m.batches); added.jobs = add(jobsSig, m.jobs); added.qc = add(qcSig, m.qc);
    added["pack records"] = add(packRecSig, m.packRecords); added.shipments = add(shipmentsSig, m.shipments); added.printers = add(printersSig, m.printers);
    added.spools = add(spoolsSig, m.spools); added["pack stock"] = add(packSig, m.packStock); added.accessories = add(itemsSig, m.accessories);
    added.movements = add(movesSig, m.movements2); added.expenses = add(expensesSig, m.expenses); added.bills = add(billsSig, m.bills);
    added.accounts = add(accountsSig, m.accounts); added.money = add(moneySig, m.money); added.assets = add(assetsSig, m.assets);
    added.goals = add(goalsSig, m.goals); added.tasks = add(tasksSig, m.tasks); added.logs = add(logsSig, m.logs);
    const have = new Set(usersSig.value.map((u) => u.name.toLowerCase()));
    usersSig.value = [...usersSig.value, ...m.team.filter((t) => !have.has(t.name.toLowerCase())).map((t) => ({ id: t.id, name: t.name, email: "", role: "operator" as const, pass: "", active: t.active, login: false, job: t.job }))];
    // Settings: only fill keys that are still empty here.
    ratesSig.value = { ...m.rates, ...ratesSig.value };
    if (m.nexcal) nexcalSig.value = { ...(m.nexcal as object), ...nexcalSig.value };
    if (m.nexres) nexresSig.value = { ...(m.nexres as object), ...nexresSig.value };
    if (m.business) bizSig.value = { ...bizSig.value, ...Object.fromEntries(Object.entries(m.business).filter(([k]) => !(bizSig.value as Record<string, unknown>)[k])) };
  });
  try { localStorage.setItem(E1_FLAG, new Date().toISOString()); } catch {}
  return added;
}

export function applyEmerald1(m: Migrated) {
  const set = <T>(s: Signal<T>, v: T) => (s.value = v);
  batch(() => {
    set(clientsSig, m.clients); set(invoicesSig, m.invoices); set(quotesSig, m.quotes); set(ordersSig, m.orders); set(batchesSig, m.batches);
    set(jobsSig, m.jobs); set(qcSig, m.qc); set(packRecSig, m.packRecords); set(shipmentsSig, m.shipments); set(printersSig, m.printers);
    set(spoolsSig, m.spools); set(packSig, m.packStock); set(itemsSig, m.accessories); set(movesSig, m.movements2); set(expensesSig, m.expenses);
    set(billsSig, m.bills); set(accountsSig, m.accounts); set(moneySig, m.money); set(assetsSig, m.assets); set(goalsSig, m.goals);
    set(tasksSig, m.tasks); set(logsSig, m.logs); set(binSig, m.bin);
    set(consSig, []); set(historySig, []); set(loansSig, []); set(statementSig, []); set(gstSig, {});
    // Floor staff join the roster as non-login members; existing accounts are kept.
    const have = new Set(usersSig.value.map((u) => u.name.toLowerCase()));
    usersSig.value = [...usersSig.value, ...m.team.filter((t) => !have.has(t.name.toLowerCase())).map((t) => ({ id: t.id, name: t.name, email: "", role: "operator" as const, pass: "", active: t.active, login: false, job: t.job }))];
    // Books start on 1 Apr 2025 with the accounts' own openings; closing stock = filament on hand at its cost.
    openingSig.value = { capital: m.accounts.reduce((a, x) => a + x.opening, 0), stock: 0, closingStock: Math.round(m.spools.reduce((a, s) => a + (s.grams / 1000) * (s.costKg ?? 800), 0)) };
    ratesSig.value = { ...ratesSig.value, ...m.rates };
    if (m.nexcal) nexcalSig.value = { ...nexcalSig.value, ...(m.nexcal as object) };
    if (m.nexres) nexresSig.value = { ...nexresSig.value, ...(m.nexres as object) };
    if (m.business) bizSig.value = { ...bizSig.value, ...m.business };
  });
  try { localStorage.setItem(E1_FLAG, new Date().toISOString()); } catch {}
}
