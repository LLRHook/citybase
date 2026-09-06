const paths = {
  compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></>,
  quest: <><path d="M6 3h12v18l-6-4-6 4Z"/><path d="M9 7h6M9 10h4"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9"/><path d="M9 21v-8h6v8"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></>,
  moon: <path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>,
  volume: <><path d="M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></>,
  mute: <><path d="M11 4 5 9H2v6h3l6 5ZM16 9l6 6M16 15l6-6"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  folder: <path d="M3 6h7l2 3h9v11H3Z"/>,
  branch: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10M18 8v2a5 5 0 0 1-5 5H6"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>,
  spark: <><path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  walk: <><circle cx="14" cy="4" r="2"/><path d="m7 11 4-4 4 3 4 1M12 8l-2 7 5 3v4M10 15l-4 6"/></>,
  orbit: <><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/></>,
  file: <><path d="M5 2h9l5 5v15H5ZM14 2v6h5"/><path d="M8 13h8M8 17h6"/></>,
};
export function Icon({ name, size = 18, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.spark}</svg>;
}
