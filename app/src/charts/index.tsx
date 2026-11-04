/** Tiny SVG charts: primary series black, secondary mid-grey. */
export function Bars({ data, labels, height = 110 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(1, ...data.map(Math.abs));
  const hasNeg = data.some((d) => d < 0);
  const zero = hasNeg ? height / 2 : height;
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" class="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (Math.abs(d) / max) * (hasNeg ? height / 2 - 4 : height - 4);
          return <rect key={i} x={i * w + w * 0.2} width={w * 0.6} y={d >= 0 ? zero - h : zero} height={Math.max(h, 1.5)} class="fill-c4" />;
        })}
      </svg>
      <div class="flex text-[11px] text-c2 mt-1.5">{labels.map((l) => <span key={l} class="flex-1 text-center">{l}</span>)}</div>
    </div>
  );
}

export function Line({ a, b, labels, height = 110 }: { a: number[]; b?: number[]; labels: string[]; height?: number }) {
  const all = [...a, ...(b ?? [])];
  const max = Math.max(...all), min = Math.min(...all);
  const pts = (s: number[]) => s.map((v, i) => `${(i / (s.length - 1)) * 100},${height - 6 - ((v - min) / (max - min || 1)) * (height - 12)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" class="w-full" style={{ height }}>
        {b && <polyline points={pts(b)} fill="none" class="stroke-c2" stroke-width="1.5" vector-effect="non-scaling-stroke" />}
        <polyline points={pts(a)} fill="none" class="stroke-c4" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex text-[11px] text-c2 mt-1.5">{labels.map((l, i) => <span key={i} class="flex-1 text-center">{l}</span>)}</div>
    </div>
  );
}

export function Ring({ value, label, size = 140 }: { value: number; label: string; size?: number }) {
  const r = 42, c = 2 * Math.PI * r, v = Math.min(value, 100);
  return (
    <div class="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} class="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" class="stroke-c1" stroke-width="8" />
        <circle cx="50" cy="50" r={r} fill="none" class="stroke-c4" stroke-width="8" stroke-linecap="round" stroke-dasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="num text-2xl font-semibold">{value}%</span>
        <span class="text-xs text-c3">{label}</span>
      </div>
    </div>
  );
}
