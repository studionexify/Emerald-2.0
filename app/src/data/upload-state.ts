/** The list of background uploads, kept apart from the queue logic so the page frame can watch it without loading the queue. */
import { signal } from "@preact/signals";

export type UpJob = {
  id: string; designId: string; designName: string; itemId: string; kind: "photo" | "file"; name: string; size: number; sent: number;
  state: "wait" | "run" | "done" | "fail"; err?: string; file: File;
};
export const uploadsSig = signal<UpJob[]>([]);
