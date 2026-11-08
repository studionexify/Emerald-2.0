/** Replace this device's records with an Emerald 1 migration. Synced like any other edit once the cloud is on. */
import { batch } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { batchesSig, consSig, logsSig, ordersSig } from "./index";
import { binSig, clientsSig, itemsSig, jobsSig, movesSig, packRecSig, packSig, printersSig, qcSig, spoolsSig, tasksSig } from "./inventory";
import { accountsSig, assetsSig, billsSig, expensesSig, goalsSig, historySig, invoicesSig, loansSig, moneySig, quotesSig, shipmentsSig, statementSig, gstSig } from "./ledger";
import { usersSig } from "./auth";
import { bizSig } from "./biz";
import { ratesSig } from "./rates";
import { nexcalSig, nexresSig } from "./pricing";
import type { Migrated } from "./e1-import";

/** Marks the store as real data: sample rows are never merged back in on a seed-version bump. */
export const E1_FLAG = "emerald:e1";

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
    ratesSig.value = { ...ratesSig.value, ...m.rates };
    if (m.nexcal) nexcalSig.value = { ...nexcalSig.value, ...(m.nexcal as object) };
    if (m.nexres) nexresSig.value = { ...nexresSig.value, ...(m.nexres as object) };
    if (m.business) bizSig.value = { ...bizSig.value, ...m.business };
  });
  try { localStorage.setItem(E1_FLAG, new Date().toISOString()); } catch {}
}
