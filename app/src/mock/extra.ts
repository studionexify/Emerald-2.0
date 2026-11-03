/** Mock records for the modules described in Blueprint v2. Phase 2 replaces with Supabase reads. */

export const clients = [
  { id: "c1", name: "Riya Shah", kind: "Individual", phone: "+91 98250 11223", city: "Vadodara", gstin: "", orders: 3, value: 2490, medium: "Instagram" },
  { id: "c2", name: "Paper Lane Stationery", kind: "Business", phone: "+91 99090 44110", city: "Ahmedabad", gstin: "24AAKFP1234M1Z2", orders: 4, value: 186400, medium: "WhatsApp" },
  { id: "c3", name: "Gift Box Co.", kind: "Business", phone: "+91 90990 22001", city: "Surat", gstin: "24AAGCG5678K1Z9", orders: 2, value: 64500, medium: "Email" },
  { id: "c4", name: "Aarav Mehta", kind: "Individual", phone: "+91 97140 55660", city: "Vadodara", gstin: "", orders: 1, value: 1899, medium: "Website" },
  { id: "c5", name: "Ishaan Desai", kind: "Individual", phone: "+91 98980 77001", city: "Anand", gstin: "", orders: 2, value: 12400, medium: "Referral" },
  { id: "c6", name: "Vadodara Gift House", kind: "Business", phone: "+91 99250 66770", city: "Vadodara", gstin: "24AAAFV9012L1Z4", orders: 1, value: 47700, medium: "Phone" },
];

export const quotes = [
  { id: "qt1", no: "Q-B-0142", date: "2026-11-02", customer: "Vadodara Gift House", value: 47700, valid: "2026-11-09", outcome: "open" },
  { id: "qt2", no: "Q-B-0141", date: "2026-11-01", customer: "Riya Shah", value: 996, valid: "2026-11-08", outcome: "open" },
  { id: "qt3", no: "Q-B-0140", date: "2026-10-28", customer: "Paper Lane Stationery", value: 57800, valid: "2026-11-04", outcome: "approved" },
  { id: "qt4", no: "Q-B-0139", date: "2026-10-25", customer: "Mira Interiors", value: 22400, valid: "2026-11-01", outcome: "lost" },
  { id: "qt5", no: "Q-A-0388", date: "2026-03-12", customer: "Old migrated quote", value: 8400, valid: "2026-03-19", outcome: "unrecorded" },
];

export const invoices = [
  { id: "i1", no: "B/26-27/0061", date: "2026-11-01", customer: "Neha Patel", order: "EM-1037", taxable: 1777, gst: 320, total: 2097, paid: true, age: 2 },
  { id: "i2", no: "B/26-27/0060", date: "2026-10-18", customer: "Kabir Joshi", order: "EM-1036", taxable: 5508, gst: 991, total: 6499, paid: true, age: 16 },
  { id: "i3", no: "B/26-27/0059", date: "2026-09-22", customer: "Gift Box Co.", order: "EM-1029", taxable: 27330, gst: 4920, total: 32250, paid: false, age: 42 },
  { id: "i4", no: "B/26-27/0058", date: "2026-08-14", customer: "Paper Lane Stationery", order: "EM-1022", taxable: 50000, gst: 9000, total: 59000, paid: false, age: 81 },
];

export const documents = [
  { id: "d1", kind: "Quotation", no: "Q-B-0142", party: "Vadodara Gift House", date: "2026-11-02" },
  { id: "d2", kind: "Tax invoice", no: "B/26-27/0061", party: "Neha Patel", date: "2026-11-01" },
  { id: "d3", kind: "Delivery challan", no: "DC-0033", party: "Gift Box Co.", date: "2026-10-30" },
  { id: "d4", kind: "Credit note", no: "CN-0004", party: "Paper Lane Stationery", date: "2026-10-12" },
  { id: "d5", kind: "Tax invoice (historical)", no: "A/25-26/0412", party: "Mira Interiors", date: "2026-03-28" },
];

export const shipments = [
  { id: "sh1", order: "EM-1037", customer: "Neha Patel", courier: "Delhivery", service: "Surface", tracking: "", paid: 120, recovered: 99, part: "1 of 1", eta: "2026-11-05" },
  { id: "sh2", order: "EM-1033", customer: "Paper Lane Stationery", courier: "DTDC", service: "Express", tracking: "D84719201", paid: 640, recovered: 600, part: "1 of 2", eta: "2026-11-01" },
  { id: "sh3", order: "EM-1031", customer: "Riya Shah", courier: "India Post", service: "Speed Post", tracking: "EV221903IN", paid: 90, recovered: 0, part: "1 of 1", eta: "2026-10-30" },
];

export const packRecords = [
  { id: "pk1", order: "EM-1038", box: "30×20×15", weight: "4.2 kg", materials: "Box ×4, bubble wrap 6 m, tape ×1", cost: 143, by: "Meet", notes: "Fragile — coasters stacked flat" },
];

export const machineLog = [
  { id: "m1", printer: "P1S-01", util: 78, uptime: 96, blocks: 2, lost: 3.5, fail: 4 },
  { id: "m2", printer: "A1-01", util: 52, uptime: 91, blocks: 3, lost: 6, fail: 11 },
  { id: "m3", printer: "A1-02", util: 18, uptime: 62, blocks: 5, lost: 22, fail: 31 },
];

export const accessories = [
  { id: "a1", cat: "Accessory", name: "Neodymium magnet 8×3", unit: "pcs", qty: 340, reorderAt: 100, cost: 4 },
  { id: "a2", cat: "Accessory", name: "NFC tag NTAG215", unit: "pcs", qty: 45, reorderAt: 50, cost: 18 },
  { id: "a3", cat: "Accessory", name: "Brass insert M3", unit: "pcs", qty: 600, reorderAt: 200, cost: 2 },
  { id: "a4", cat: "Part", name: "0.4 mm hardened nozzle", unit: "pcs", qty: 3, reorderAt: 2, cost: 850 },
  { id: "a5", cat: "Part", name: "PEI build plate", unit: "pcs", qty: 1, reorderAt: 1, cost: 2400 },
];

export const movements = [
  { id: "mv1", date: "2026-11-02", item: "PLA Black · Bambu", dir: "in", qty: "3 kg", cost: 3750, vendor: "Bambu Store India", by: "Ankit" },
  { id: "mv2", date: "2026-11-01", item: "PETG White · Bambu", dir: "out", qty: "820 g", cost: 0, vendor: "EM-1041 job #1", by: "Chintan" },
  { id: "mv3", date: "2026-10-30", item: "Box 15×15×10", dir: "in", qty: "50 pcs", cost: 900, vendor: "Sharma Traders", by: "Meet" },
  { id: "mv4", date: "2026-10-29", item: "Bubble wrap", dir: "out", qty: "6 m", cost: 0, vendor: "EM-1038 packing", by: "Meet" },
];

export const bills = [
  { id: "bl1", vendor: "Sharma Traders", no: "ST/26-27/0148", date: "2026-11-01", total: 4956, tax: 756, cat: "Packing", status: "needs_review", note: "Lines sum to ₹4,180 — ₹20 short" },
  { id: "bl2", vendor: "Bambu Store India", no: "BSI-88231", date: "2026-10-30", total: 11250, tax: 1716, cat: "Filament", status: "logged", note: "" },
  { id: "bl3", vendor: "Jio Fiber", no: "JF-OCT-26", date: "2026-10-28", total: 1179, tax: 180, cat: "Utilities", status: "logged", note: "" },
  { id: "bl4", vendor: "Unknown", no: "—", date: "2026-10-27", total: 0, tax: 0, cat: "—", status: "failed", note: "Photo too blurred to read — filed, type figures by hand" },
  { id: "bl5", vendor: "Local hardware", no: "CM-221", date: "2026-10-20", total: 340, tax: 0, cat: "Tools", status: "rejected", note: "Personal purchase" },
];

export const expenses = [
  { id: "e1", date: "2026-11-01", head: "Filament", vendor: "Bambu Store India", amount: 11250, bill: true },
  { id: "e2", date: "2026-10-31", head: "Electricity", vendor: "MGVCL", amount: 2860, bill: false },
  { id: "e3", date: "2026-10-28", head: "Utilities", vendor: "Jio Fiber", amount: 1179, bill: true },
  { id: "e4", date: "2026-10-25", head: "Courier", vendor: "Delhivery", amount: 1840, bill: false },
  { id: "e5", date: "2026-10-20", head: "Packing", vendor: "Sharma Traders", amount: 2100, bill: true },
];

export const bankAccounts = [
  { id: "ba1", name: "HDFC Current ··4421", bal: 184250, recon: "31 Oct", pending: 3 },
  { id: "ba2", name: "Cash in hand", bal: 6420, recon: "02 Nov", pending: 0 },
  { id: "ba3", name: "Razorpay settlements", bal: 12300, recon: "29 Oct", pending: 5 },
];

export const statementLines = [
  { id: "sl1", date: "2026-11-01", text: "UPI/NEHA PATEL/EM1037", amount: 2097, guess: "Receipt · B/26-27/0061", state: "review" },
  { id: "sl2", date: "2026-10-31", text: "NEFT MGVCL ELEC", amount: -2860, guess: "Expense · Electricity", state: "review" },
  { id: "sl3", date: "2026-10-30", text: "IMPS BAMBU STORE", amount: -11250, guess: "Bill · BSI-88231", state: "confirmed" },
  { id: "sl4", date: "2026-10-29", text: "SELF TRANSFER TO CASH", amount: -5000, guess: "Transfer · Cash in hand", state: "review" },
];

export const goals = [
  { id: "g1", title: "₹5L this quarter", metric: "Revenue earned", period: "Q3 · Oct–Dec", value: 142800, target: 500000, pace: 37, note: "Diwali corporate push", money: true, cap: false },
  { id: "g2", title: "Cash in by Diwali", metric: "Cash collected", period: "November", value: 8596, target: 120000, pace: 7, note: "", money: true, cap: false },
  { id: "g3", title: "Keep spend under ₹60k", metric: "Spending ceiling", period: "November", value: 19229, target: 60000, pace: 7, note: "A ceiling — met by staying under", money: true, cap: true },
  { id: "g4", title: "40 orders this year", metric: "Orders closed", period: "FY 2026-27", value: 19, target: 40, pace: 59, note: "", money: false, cap: false },
  { id: "g5", title: "Margin above 55%", metric: "Average margin", period: "FY 2026-27", value: 58, target: 55, pace: 59, note: "", money: false, cap: false, pct: true },
  { id: "g6", title: "Instagram reels", metric: "Tracked by hand", period: "November", value: 4, target: 12, pace: 7, note: "Moved by hand", money: false, cap: false },
];

export const books = {
  sales: [
    { id: "s1", date: "2026-11-01", no: "B/26-27/0061", party: "Neha Patel", taxable: 1777, cgst: 160, sgst: 160, igst: 0, total: 2097 },
    { id: "s2", date: "2026-10-18", no: "B/26-27/0060", party: "Kabir Joshi", taxable: 5508, cgst: 496, sgst: 495, igst: 0, total: 6499 },
    { id: "s3", date: "2026-09-22", no: "B/26-27/0059", party: "Gift Box Co.", taxable: 27330, cgst: 0, sgst: 0, igst: 4920, total: 32250 },
  ],
  purchase: [
    { id: "p1", date: "2026-10-30", no: "BSI-88231", party: "Bambu Store India", taxable: 9534, cgst: 858, sgst: 858, igst: 0, total: 11250 },
    { id: "p2", date: "2026-10-28", no: "JF-OCT-26", party: "Jio Fiber", taxable: 999, cgst: 90, sgst: 90, igst: 0, total: 1179 },
  ],
  debtors: [
    { id: "d1", party: "Paper Lane Stationery", b0: 0, b30: 0, b60: 59000, b90: 0, total: 59000 },
    { id: "d2", party: "Gift Box Co.", b0: 0, b30: 32250, b60: 0, b90: 0, total: 32250 },
  ],
  creditors: [
    { id: "c1", party: "Sharma Traders", msme: "Micro", due: "2026-11-15", total: 4956, h: true },
    { id: "c2", party: "Polymaker Distributor", msme: "—", due: "2026-11-30", total: 8200, h: false },
  ],
  bank: [
    { id: "k1", date: "2026-11-01", text: "Receipt · Neha Patel", dr: 2097, cr: 0, bal: 184250 },
    { id: "k2", date: "2026-10-31", text: "Payment · MGVCL", dr: 0, cr: 2860, bal: 182153 },
    { id: "k3", date: "2026-10-30", text: "Payment · Bambu Store India", dr: 0, cr: 11250, bal: 185013 },
  ],
  expenseHeads: [
    { id: "h1", head: "Filament", amount: 41200 }, { id: "h2", head: "Electricity", amount: 14300 }, { id: "h3", head: "Courier", amount: 9600 },
    { id: "h4", head: "Packing", amount: 7800 }, { id: "h5", head: "Wastage (QC scrap + run variance)", amount: 2140 },
  ],
  capital: [
    { id: "cp1", date: "2026-04-01", text: "Opening capital", amount: 350000 },
    { id: "cp2", date: "2026-07-10", text: "Drawings", amount: -40000 },
  ],
  assets: [
    { id: "fa1", name: "Bambu P1S Combo", machine: "P1S-01", block: "Plant & machinery 15%", cost: 84999, dep: 12750, wdv: 72249 },
    { id: "fa2", name: "Bambu A1 Combo", machine: "A1-01", block: "Plant & machinery 15%", cost: 49999, dep: 7500, wdv: 42499 },
    { id: "fa3", name: "Laptop", machine: "—", block: "Computers 40%", cost: 72000, dep: 28800, wdv: 43200 },
  ],
  msme: [
    { id: "ms1", party: "Sharma Traders", cls: "Micro", bill: "ST/26-27/0148", date: "2026-11-01", deadline: "2026-12-16", left: 43 },
  ],
  parties: [
    { id: "pt1", name: "Paper Lane Stationery", type: "Customer", gstin: "24AAKFP1234M1Z2", bal: 59000 },
    { id: "pt2", name: "Gift Box Co.", type: "Customer", gstin: "24AAGCG5678K1Z9", bal: 32250 },
    { id: "pt3", name: "Sharma Traders", type: "Vendor · MSME Micro", gstin: "24ABCPS1111A1Z1", bal: -4956 },
    { id: "pt4", name: "Bambu Store India", type: "Vendor", gstin: "27AAACB2222B1Z3", bal: 0 },
  ],
};

export const gstMonths = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((m, i) => ({
  id: m, m, sales: 80000 + i * 9000, out: Math.round((80000 + i * 9000) * 0.18), inp: 6000 + i * 700, r1: i < 6, r3b: i < 6,
}));

export const roles = [
  { id: "r1", role: "Owner", orders: "Full", production: "Full", finance: "Full", books: "Full", settings: "Full" },
  { id: "r2", role: "Manager", orders: "Full", production: "Full", finance: "View", books: "—", settings: "—" },
  { id: "r3", role: "Operator", orders: "View", production: "Full", finance: "—", books: "—", settings: "—" },
  { id: "r4", role: "Accountant", orders: "View", production: "—", finance: "Full", books: "Full", settings: "—" },
];

export const alerts = {
  Money: [
    { t: "danger", text: "B/26-27/0058 · Paper Lane — unpaid 81 days", href: "/mauny/finance" },
    { t: "warn", text: "B/26-27/0059 · Gift Box Co. — unpaid 42 days", href: "/mauny/finance" },
    { t: "danger", text: "EM-1034 closed out but never invoiced", href: "/work/invoice" },
    { t: "warn", text: "Q-B-0141 lapses in 5 days", href: "/work/quotes" },
    { t: "info", text: "1 uploaded bill waiting for review · 1 unreadable", href: "/mauny/purchases" },
    { t: "warn", text: "EM-1041 Organisers A packed — dispatch invoice not raised", href: "/work/bulk" },
  ],
  Quality: [
    { t: "danger", text: "EM-1038 coaster run 5 failed — no reprint queued", href: "/work/production" },
    { t: "warn", text: "A1-02 failing 31% vs floor 12%", href: "/workshop" },
    { t: "info", text: "EM-1038 QC ended in scrap (90 g)", href: "/work/qc" },
  ],
  Flow: [
    { t: "warn", text: "In-house EM-1040 stuck in Production 4 days — PETG Grey out", href: "/work/production" },
    { t: "warn", text: "EM-1037 shipping — tracking number missing", href: "/work/shipping" },
    { t: "danger", text: "EM-1038 missed target date (03 Nov)", href: "/work/packing" },
  ],
  Stock: [
    { t: "danger", text: "PETG Grey — out of stock", href: "/workshop/filament" },
    { t: "warn", text: "Bubble wrap 8 m — below reorder (15 m)", href: "/workshop/packing" },
    { t: "warn", text: "NFC tag NTAG215 — below reorder", href: "/workshop/parts" },
  ],
} as Record<string, { t: "danger" | "warn" | "info"; text: string; href: string }[]>;
