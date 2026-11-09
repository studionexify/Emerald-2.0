/** Alpha / Beta view: Alpha = bank + UPI, Beta = cash. Owner and partner choose what Emerald shows.
   This is a view filter only — Books, GST, Tally and the year-end pack always include every record. */
import { persisted } from "./store";
import { me } from "./auth";
import { accountsSig, type MoneyEntry } from "./ledger";
import type { PayMode } from "../mock/types";

export type BooksMode = "alpha" | "beta" | "both";
export const MODE_LABEL: Record<BooksMode, string> = { alpha: "Alpha", beta: "Beta", both: "Alpha + Beta" };
export const PAY_LABEL: Record<PayMode, string> = { alpha: "Alpha · bank / UPI", beta: "Beta · cash" };
export const booksModeSig = persisted<BooksMode>("books-mode", "both");
export const canSwitchMode = () => ["owner", "partner"].includes(me.value?.role ?? "");
export const accountMode = (id?: string): PayMode => accountsSig.value.find((a) => a.id === id)?.mode ?? (/cash/i.test(accountsSig.value.find((a) => a.id === id)?.name ?? "") ? "beta" : "alpha");
/** Is a record with this pay mode visible in the current view? Untagged records count as Alpha. */
export const shown = (pay?: PayMode) => booksModeSig.value === "both" || (pay ?? "alpha") === booksModeSig.value;
export const shownMoney = (m: MoneyEntry) => shown(accountMode(m.account));
export const shownExp = (e: { pay?: PayMode; account?: string }) => shown(e.pay ?? (e.account ? accountMode(e.account) : "alpha"));
export const modeAccounts = () => accountsSig.value.filter((a) => shown(accountMode(a.id)));
