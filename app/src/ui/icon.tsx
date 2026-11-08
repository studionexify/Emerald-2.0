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
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  scale: "M5 20h14M12 4v16M6 8h12M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z",
  in: "M12 4v12M6 10l6 6 6-6M4 20h16",
  out: "M12 20V8M6 14l6-6 6 6M4 4h16",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M4 5h16M4 12h16M4 19h16",
  printer: "M7 3h10v5H7zM4 8h16v9H4zM7 14h10v7H7z",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  stamp: "M9 4h6l-1 7h-4zM5 15h14v3H5zM7 21h10",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5L16 9.5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  truck: "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  alert: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8v5M12 16v.01",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  wallet: "M4 7h15v13H4zM4 7l11-3v3M15 13h4",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  cash: "M3 7h18v10H3zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  wrench: "M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 0-2-2",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.more} />
    </svg>
  );
}
