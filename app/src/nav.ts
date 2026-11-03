export type NavItem = { href: string; label: string; icon: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/work", label: "Production", icon: "work" },
  { href: "/workshop", label: "Store", icon: "box" },
  { href: "/calculator", label: "Calculator", icon: "calc" },
  { href: "/mauny", label: "Mauny", icon: "money" },
  { href: "/alerts", label: "Attention", icon: "bell" },
  { href: "/todo", label: "To-do", icon: "check" },
  { href: "/logs", label: "Logs", icon: "list" },
  { href: "/bin", label: "Bin", icon: "bin" },
];

export const WORK_TABS = [
  { href: "/work", label: "Overview" },
  { href: "/work/orders", label: "Orders" },
  { href: "/work/production", label: "Production" },
  { href: "/work/qc", label: "QC" },
  { href: "/work/packing", label: "Packing" },
  { href: "/work/invoice", label: "Invoice" },
  { href: "/work/shipping", label: "Shipping" },
  { href: "/work/archive", label: "Archive" },
  { href: "/work/bulk", label: "Bulk" },
  { href: "/work/clients", label: "Clients" },
  { href: "/work/quotes", label: "Quotes" },
  { href: "/work/documents", label: "Documents" },
];

export const MAUNY_TABS = [
  { href: "/mauny", label: "Overview" },
  { href: "/mauny/purchases", label: "Purchases" },
  { href: "/mauny/finance", label: "Finance" },
  { href: "/mauny/goals", label: "Goals" },
  { href: "/mauny/accounts", label: "Accounts" },
  { href: "/mauny/books", label: "Books" },
  { href: "/mauny/gst", label: "GST desk" },
  { href: "/mauny/reports", label: "Reports" },
];

export const WORKSHOP_TABS = [
  { href: "/workshop", label: "Printers" },
  { href: "/workshop/filament", label: "Filament" },
  { href: "/workshop/parts", label: "Accessories & parts" },
  { href: "/workshop/packing", label: "Packing stock" },
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
  { href: "/settings/users", label: "Users & roles" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/business", label: "Business profile" },
  { href: "/settings/rates", label: "Rates & prices" },
  { href: "/settings/integrations", label: "Integrations" },
];
