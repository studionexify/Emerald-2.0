export type NavItem = { href: string; label: string; icon: string };

/** Sidebar groups. Production is split by who the work is for. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "", items: [{ href: "/", label: "Dashboard", icon: "home" }] },
  { label: "Production", items: [
    { href: "/work", label: "Client", icon: "user" },
    { href: "/work/b2b", label: "Bulk & B2B", icon: "work" },
    { href: "/work/inhouse", label: "In-house", icon: "wrench" },
  ] },
  { label: "Operations", items: [
    { href: "/workshop", label: "Store", icon: "box" },
    { href: "/calculator", label: "Nexcal", icon: "calc" },
    { href: "/mauny", label: "Mauny", icon: "money" },
    { href: "/work/invoice", label: "Invoice", icon: "receipt" },
  ] },
  { label: "Workspace", items: [
    { href: "/alerts", label: "Attention", icon: "bell" },
    { href: "/todo", label: "To-do", icon: "check" },
    { href: "/logs", label: "Logs", icon: "list" },
    { href: "/bin", label: "Bin", icon: "bin" },
  ] },
];

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/work", label: "Production", icon: "work" },
  { href: "/workshop", label: "Store", icon: "box" },
  { href: "/calculator", label: "Nexcal", icon: "calc" },
  { href: "/mauny", label: "Mauny", icon: "money" },
  { href: "/work/invoice", label: "Invoice", icon: "receipt" },
  { href: "/alerts", label: "Attention", icon: "bell" },
  { href: "/todo", label: "To-do", icon: "check" },
  { href: "/logs", label: "Logs", icon: "list" },
  { href: "/bin", label: "Bin", icon: "bin" },
];

export const WORK_TABS = [
  { href: "/work", label: "Client orders" },
  { href: "/work/b2b", label: "Bulk & B2B" },
  { href: "/work/inhouse", label: "In-house" },
  { href: "/work/orders", label: "Orders" },
  { href: "/work/production", label: "Production" },
  { href: "/work/qc", label: "QC" },
  { href: "/work/packing", label: "Packing" },
  { href: "/work/invoice", label: "Invoice" },
  { href: "/work/shipping", label: "Shipping" },
  { href: "/work/archive", label: "Archive" },
  { href: "/work/bulk", label: "Bulk batches" },
  { href: "/work/clients", label: "Clients" },
  { href: "/work/quotes", label: "Quotes" },
  { href: "/work/documents", label: "Documents" },
];

export const MAUNY_TABS = [
  { href: "/mauny", label: "Entry" },
  { href: "/mauny/daybook", label: "Day book" },
  { href: "/mauny/purchases", label: "Purchases" },
  { href: "/mauny/finance", label: "Finance" },
  { href: "/mauny/goals", label: "Goals" },
  { href: "/mauny/books", label: "Books" },
  { href: "/mauny/gst", label: "GST desk" },
  { href: "/mauny/reports", label: "Reports" },
  { href: "/mauny/accounts", label: "Settings" },
];

export const WORKSHOP_TABS = [
  { href: "/workshop", label: "Filament" },
  { href: "/workshop/printers", label: "Printers" },
  { href: "/workshop/parts", label: "Accessories & parts" },
  { href: "/workshop/packing", label: "Packing stock" },
  { href: "/workshop/audit", label: "Stock audit" },
  { href: "/workshop/movements", label: "Stock ledger" },
  { href: "/workshop/consumption", label: "Consumption" },
];

export const CALC_TABS = [
  { href: "/calculator", label: "Nexcal · FDM" },
  { href: "/calculator/nexres", label: "NexRes · Resin" },
  { href: "/calculator/settings", label: "Pricing settings" },
];

export const SETTINGS_TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/users", label: "Team & users" },
  { href: "/settings/business", label: "Business profile" },
  { href: "/settings/rates", label: "Rates & prices" },
  { href: "/settings/integrations", label: "Integrations" },
];
