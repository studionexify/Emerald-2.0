import { lazy, navigate, path } from "./router";
import { can, isExternal, me, moduleOf, sessionSig, usersSig } from "./data";
import { Frame } from "./frame/Frame";
import { Empty, Page } from "./ui";

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
  ["/workshop/consumption", L(ws, "ConsumptionLog")],
  ["/calculator/settings", L(calc, "PricingSettings")],
  ["/settings/integrations", L(g, "Integrations")],
  ["/settings/rates", L(g, "Rates")],
  ["/alerts", L(g, "Alerts")],
  ["/work/bulk", D(() => import("./routes/work/Bulk"))],
  ["/workshop", L(ws, "Printers")],
  ["/workshop/team", L(ws, "Team")],
  ["/workshop/filament", L(ws, "Filament")],
  ["/workshop/packing", L(ws, "PackStock")],
  ["/calculator", L(calc, "Nexcal")],
  ["/calculator/nexres", L(calc, "NexRes")],
  ["/mauny", L(mauny, "MaunyHome")],
  ["/mauny/purchases", L(mauny, "Purchases")],
  ["/mauny/finance", L(mauny, "Finance")],
  ["/mauny/goals", L(mauny, "Goals")],
  ["/mauny/accounts", L(mauny, "Accounts")],
  ["/mauny/books", L(mauny, "Books")],
  ["/mauny/gst", L(mauny, "Gst")],
  ["/mauny/reports", L(mauny, "Reports")],
  ["/todo", L(g, "Todo")],
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
  if (!me.value) { sessionSig.value = { userId: usersSig.value.find((u) => u.role === "owner")!.id, at: Date.now() }; return null; }
  if (isExternal() && !path.value.startsWith("/mauny/gst") && path.value !== "/settings") { navigate("/mauny/gst"); return null; }
  const C = path.value === "/search" ? SearchPage : table.get(path.value) ?? NotFound;
  const ok = path.value === "/search" || path.value === "/settings" || can(moduleOf(path.value));
  return <Frame>{ok ? <C key={path.value} /> : <NoAccess />}</Frame>;
}
