export type NavItem = { href: string; label: string; icon: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/work", label: "Work Area", icon: "work" },
  { href: "/workshop", label: "Workshop & Inventory", icon: "box" },
  { href: "/calculator", label: "Calculator", icon: "calc" },
  { href: "/mauny", label: "Mauny", icon: "money" },
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
  { href: "/work/shipping", label: "Shipping" },
  { href: "/work/archive", label: "Archive" },
  { href: "/work/bulk", label: "Bulk" },
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
  { href: "/workshop/team", label: "Team" },
  { href: "/workshop/filament", label: "Filament" },
  { href: "/workshop/packing", label: "Packing stock" },
];

export const CALC_TABS = [
  { href: "/calculator", label: "Nexcal · FDM" },
  { href: "/calculator/nexres", label: "NexRes · Resin" },
];

export const SETTINGS_TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/users", label: "Users & roles" },
  { href: "/settings/business", label: "Business profile" },
];
