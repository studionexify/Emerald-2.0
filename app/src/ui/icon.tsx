const P: Record<string, string> = {
  menu: "M4 6h16M4 12h16M4 18h10",
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  work: "M4 7h16v12H4zM9 7V5h6v2M4 12h16",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  calc: "M6 3h12v18H6zM9 7h6M9 12h1M14 12h1M9 16h1M14 16h1",
  money: "M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 9v.01M18 15v.01",
  check: "M4 12l5 5L20 6",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  bin: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20h4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10",
  copy: "M8 8h12v12H8zM4 16V4h12",
  close: "M6 6l12 12M18 6 6 18",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M4 5h16M4 12h16M4 19h16",
  printer: "M7 3h10v5H7zM4 8h16v9H4zM7 14h10v7H7z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.more} />
    </svg>
  );
}
