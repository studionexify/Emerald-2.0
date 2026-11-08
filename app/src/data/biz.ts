import { persisted } from "./store";
export type Biz = { name: string; gstin: string; pan: string; udyam: string; phone: string; email: string; address: string; bank: string; series: string; terms: string;
  website?: string; addressShort?: string; upi?: string; upiNumber?: string; bankName?: string; accName?: string; accNo?: string; ifsc?: string; jurisdiction?: string };
export const bizSig = persisted<Biz>("business", { name: "Studio Nexify", gstin: "24ABCDE1234F1Z5", pan: "ABCDE1234F", udyam: "", phone: "+91 98XXX XXXXX", email: "connect@studionexify.com", address: "Vadodara, Gujarat", bank: "HDFC ··4421 · IFSC HDFC0000000", series: "A-### (FY 25-26) · B-### (FY 26-27)", terms: "Payment within 30 days. Goods once printed are made to order." });
