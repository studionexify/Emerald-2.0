/** Files going to Google Drive in the background. Visible on every page, so a design can be saved and the person can move on. */
import { useState } from "preact/hooks";
import { Icon, ask } from "../ui";
import { cancelJob, dismissJob, retryJob } from "../data/nexder-queue";
import { uploadsSig } from "../data/upload-state";

const mb = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function UploadDock() {
  const jobs = uploadsSig.value, [open, setOpen] = useState(true);
  if (!jobs.length) return null;
  const total = jobs.reduce((a, j) => a + j.size, 0), sent = jobs.reduce((a, j) => a + (j.state === "done" ? j.size : Math.min(j.sent, j.size)), 0);
  const left = jobs.filter((j) => j.state === "wait" || j.state === "run").length, failed = jobs.filter((j) => j.state === "fail").length;
  const pct = total ? Math.min(100, Math.round((sent / total) * 100)) : 0;
  const head = left ? `Uploading ${left} file${left > 1 ? "s" : ""} to Google Drive` : failed ? `${failed} upload${failed > 1 ? "s" : ""} did not finish` : "All files uploaded";
  const stop = async (id: string, running: boolean) => {
    if (running && !(await ask("Stop this upload? The file stays on its design marked “not uploaded”, and you can upload it again later.", { ok: "Stop upload", danger: true }))) return;
    cancelJob(id);
  };
  return (
    <section aria-label="Uploads" class="fixed z-40 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4 md:right-auto md:left-[17.5rem] w-[min(380px,calc(100vw-1.5rem))] rounded-2xl bg-c0 shadow-2xl border border-line overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} class="w-full flex items-center gap-2.5 px-3.5 py-3 text-left cursor-pointer !min-h-0">
        <span class={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${left ? "bg-c4 text-c0" : failed ? "bg-amb-bg text-amb" : "bg-grn-bg text-grn"}`}><Icon name={left ? "in" : failed ? "alert" : "check"} size={14} /></span>
        <span class="min-w-0 flex-1"><b class="block text-[13px] font-semibold break-words">{head}</b><span class="block t-meta num">{mb(sent)} of {mb(total)}{left ? ` · ${pct}%` : ""}</span></span>
        <span class={`text-c3 inline-flex ${open ? "" : "rotate-180"}`}><Icon name="down" size={14} /></span></button>
      {left > 0 && <div class="h-1 bg-c1"><div class="h-full bg-acc transition-[width]" style={{ width: `${pct}%` }} /></div>}
      {open && <div class="max-h-[min(320px,45dvh)] overflow-y-auto overscroll-contain border-t border-line p-2 grid gap-1.5">
        {jobs.map((j) => {
          const run = j.state === "run", p = j.size ? Math.min(100, Math.round((j.sent / j.size) * 100)) : 0;
          return (
            <div key={j.id} class="rounded-xl bg-c1/60 px-2.5 py-2">
              <div class="flex items-start gap-2">
                <span class="min-w-0 flex-1"><b class="block text-[12.5px] font-medium break-all">{j.name}</b><span class="block t-meta break-words">{j.designName} · {mb(j.size)}</span></span>
                {j.state === "fail" && <button type="button" onClick={() => retryJob(j.id)} class="h-7 px-2.5 !min-h-0 rounded-full border border-line bg-c0 text-[12px] font-semibold cursor-pointer">Retry</button>}
                {j.state === "done" ? <button type="button" aria-label="Dismiss" onClick={() => dismissJob(j.id)} class="w-7 h-7 !min-h-0 rounded-full grid place-items-center text-grn cursor-pointer"><Icon name="check" size={14} /></button>
                  : <button type="button" aria-label={`Stop ${j.name}`} onClick={() => stop(j.id, run)} class="w-7 h-7 !min-h-0 rounded-full grid place-items-center text-c3 cursor-pointer"><Icon name="close" size={13} /></button>}
              </div>
              {(run || j.state === "wait") && <div class="mt-1.5 h-1 rounded-full bg-c0 overflow-hidden"><div class="h-full bg-acc" style={{ width: `${run ? p : 0}%` }} /></div>}
              <p class={`t-meta mt-1 break-words ${j.state === "fail" ? "text-red" : ""}`}>{j.state === "wait" ? "Waiting" : run ? `${p}%` : j.state === "done" ? "Uploaded" : j.err}</p>
            </div>);
        })}
        {!left && <button type="button" onClick={() => (uploadsSig.value = [])} class="justify-self-end text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0 px-1">Clear list</button>}
      </div>}
    </section>
  );
}
