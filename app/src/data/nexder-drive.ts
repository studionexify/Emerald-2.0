/** The real Nexder backend: Google Drive (through the nexder-drive function and the /nexder-dl Worker) and the Supabase preview bucket. */
import type { Backend, Space } from "./nexder";
import { callFn, previewDel, previewGet, previewPut } from "./sync";
import { sendResumable, xhrPut } from "./resumable";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const r = await callFn<T>("nexder-drive", body);
  if (r.error !== undefined) throw new Error(r.error);
  return r.data as T;
}

export const real: Backend = {
  quota: () => call<Space>({ action: "quota" }),
  folder: async (cat, label) => (await call<{ id: string }>({ action: "folder", cat, label })).id,
  async upload(file, folder, onSent, signal) {
    const { session } = await call<{ session: string }>({ action: "start", folder, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
    const id = await sendResumable(session, file, xhrPut, onSent, signal);
    await call({ action: "confirm", id, folder, size: file.size }); // a file counts only once Drive shows it in the right folder with the right size
    return id;
  },
  async links(files) { const { tickets } = await call<{ tickets: string[] }>({ action: "ticket", files: files.map((f) => ({ id: f.drive, name: f.name })) }); return tickets.map((t) => `/nexder-dl?t=${t}`); },
  trash: async (id, on) => { await call({ action: "trash", id, on }); },
  purge: async (ids) => { if (ids.length) await call({ action: "purge", ids }); },
  sweep: async () => (await call<{ deleted: number }>({ action: "sweep" })).deleted,
  previewPut: async (id, blob) => { const e = await previewPut(id, blob); if (e) throw new Error("Could not store the preview: " + e); },
  previewGet,
  previewDel,
};
