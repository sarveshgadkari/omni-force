import type { ModuleKey } from "@/lib/site";

export function ProductIcon({ m, size = 22 }: { m: ModuleKey; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {m === "directory" && <path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.5 5.5l3.5 4M17.5 5.5l-3.5 4M6.5 18.5l3.5-4M17.5 18.5l-3.5-4" />}
      {m === "wsso" && <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16M11 13v2h2v-2" />}
      {m === "workforce" && <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM5 17l.7 1.8L7.5 19.5l-1.8.7L5 22l-.7-1.8L2.5 19.5l1.8-.7zM19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z" />}
    </svg>
  );
}

export function Check() {
  return <svg className="icon check-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6" /></svg>;
}

export function External() {
  return <svg className="icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
}

export function Arrow() {
  return <svg className="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
