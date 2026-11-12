/** Shrinks a photo before it is stored or synced: longest edge ≤ 1920 px, JPEG ~0.72 → typically 150–350 KB instead of 3–8 MB. */
export function shrinkImage(file: File, max = 1920, q = 0.72): Promise<string> {
  return new Promise((done) => {
    const fallback = () => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsDataURL(file); };
    if (!file.type.startsWith("image/")) return fallback();
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext("2d"); if (!g) return fallback();
      g.drawImage(img, 0, 0, c.width, c.height); done(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fallback(); };
    img.src = url;
  });
}
