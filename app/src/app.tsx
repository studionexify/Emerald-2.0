import { lazy, navigate, path } from "./router";
import { can, isExternal, me, moduleOf, sessionSig, usersSig } from "./data";
import { Frame } from "./frame/Frame";
import { Empty, Page } from "./ui";
import { cloudEnabled, syncState } from "./data/sync";
import { SignIn } from "./frame/SignIn";

const L = <T extends Record<string, any>>(load: () => Promise<T>, name: keyof T) => lazy(() => load().then((m) => m[name]));
const D = (load: () => Promise<{ default: any }>) => lazy(() => load().then((m) => m.default));
const work = () => import("./routes/work/Stages");
const ws = () => import("./routes/Workshop");
const calc = () => import("./routes/Calculator");
const mauny = () => import("./routes/Mauny");
const rec = () => import("./routes/work/Records");
const g = () => import("./routes/Global");

const routes: [string, any][] = [
  ["/", D(() => import("./routes/Dashboard"))],
  ["/more", D(() => import("./routes/More"))],
  ["/work", D(() => import("./routes/work/Overview"))],
  ["/work/b2b", L(() => import("./routes/work/Overview"), "BulkB2B")],
  ["/work/inhouse", L(() => import("./routes/work/Overview"), "InHouse")],
  ["/work/orders", D(() => import("./routes/work/Orders"))],
  ["/work/production", L(work, "Production")],
  ["/work/qc", L(work, "QC")],
  ["/work/packing", L(work, "Packing")],
  ["/work/shipping", L(rec, "Shipping")],
  ["/work/archive", L(work, "Archive")],
  ["/work/invoice", L(rec, "Invoice")],
  ["/work/clients", L(rec, "Clients")],
  ["/work/quotes", L(rec, "Quotes")],
  ["/work/documents", L(rec, "Documents")],
  ["/workshop/parts", L(ws, "Parts")],
  ["/workshop/movements", L(ws, "Movements")],
  ["/workshop/audit", L(() => import("./routes/Audit"), "StockAudit")],
  ["/workshop/consumption", L(ws, "ConsumptionLog")],
  ["/calculator/settings", L(calc, "PricingSettings")],
  ["/settings/integrations", L(g, "Integrations")],
  ["/settings/rates", L(g, "Rates")],
  ["/alerts", L(g, "Alerts")],
  ["/work/bulk", D(() => import("./routes/work/Bulk"))],
  ["/workshop", L(ws, "Filament")],
  ["/workshop/printers", L(ws, "Printers")],
  ["/workshop/filament", L(ws, "Filament")], // old link
  ["/workshop/packing", L(ws, "PackStock")],
  ["/calculator", L(calc, "Nexcal")],
  ["/calculator/nexres", L(calc, "NexRes")],
  ["/mauny", L(() => import("./routes/MaunyHome"), "MaunyHome")],
  ["/mauny/daybook", L(mauny, "DayBook")],
  ["/mauny/purchases", L(mauny, "Purchases")],
  ["/mauny/finance", L(mauny, "Finance")],
  ["/mauny/goals", L(mauny, "Goals")],
  ["/mauny/accounts", L(mauny, "Accounts")],
  ["/mauny/books", L(mauny, "Books")],
  ["/mauny/gst", L(mauny, "Gst")],
  ["/mauny/reports", L(mauny, "Reports")],
  ["/todo", L(() => import("./routes/Todo"), "Todo")],
  ["/logs", L(g, "Logs")],
  ["/bin", L(g, "Bin")],
  ["/settings", L(g, "Profile")],
  ["/settings/users", L(g, "Users")],
  ["/settings/business", L(g, "Business")],
];

function NotFound() {
  return <Page title="Not found"><Empty title="This page doesn't exist" action={<a class="underline" href="/">Go home</a>} /></Page>;
}

const table = new Map(routes);

const SearchPage = L(g, "Search");
function NoAccess() {
  return <Page title="No access"><Empty title="Your role can't open this page" hint="Ask the owner to change your role in Settings → Users & roles." /></Page>;
}
export function App() {
  if (cloudEnabled) {
    const st = syncState.value;
    if (st === "checking") return null;
    if (!me.value) return st === "signed-out" || st === "error" ? <SignIn /> : null;
  }
  if (!me.value) { sessionSig.value = { userId: usersSig.value.find((u) => u.role === "owner")!.id, at: Date.now() }; return null; }
  if (isExternal() && !path.value.startsWith("/mauny/gst") && path.value !== "/settings") { navigate("/mauny/gst"); return null; }
  const C = path.value === "/search" ? SearchPage : table.get(path.value) ?? NotFound;
  const ok = path.value === "/search" || path.value === "/settings" || can(moduleOf(path.value));
  return <Frame>{ok ? <C key={path.value} /> : <NoAccess />}</Frame>;
}

/* Warm the main sections once the browser is idle, so the first tap on a tab is instant. Skipped on data saver. */
const conn = (navigator as any).connection;
if (!conn?.saveData && !/2g/.test(conn?.effectiveType ?? "")) {
  const idle = (cb: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500));
  const queue = [() => import("./routes/Dashboard"), work, () => import("./routes/work/Orders"), mauny, calc, ws, g, rec];
  const next = () => { const f = queue.shift(); if (f) f().finally(() => idle(next)); };
  addEventListener("load", () => idle(next), { once: true });
}
