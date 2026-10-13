import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { ModuleKey } from "../lib/types";

/* ───────────────────────── brand ───────────────────────── */

export function Wordmark({ size = 32 }: { size?: number }) {
  const height = Math.round(size * 2.15);
  return (
    <span className="wordmark">
      <img src="/omniforce-vector-logo.png" alt="Omni Force Vector" height={height} />
    </span>
  );
}

/* ───────────────────────── icons ───────────────────────── */

const paths = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5 12 22l10-4.5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  check: "M4 12.5 9.5 18 20 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7.5h.01",
  ok: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 12.5l3 3 5-6",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  key: "M15 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM13.8 11.8 21 19v2h-3v-2h-2v-2h-2l-1.6-1.6",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  rocket: "M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5zM9 10 5 10l-2 3 5 1M14 15v4l-3 2-1-5",
  inbox: "M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2",
};
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

export function ModuleIcon({ m, size = 20 }: { m: ModuleKey; size?: number }) {
  return (
    <svg className="micon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {m === "directory" && <path d="M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.5 5.5l3.5 4M17.5 5.5l-3.5 4M6.5 18.5l3.5-4M17.5 18.5l-3.5-4" />}
      {m === "wsso" && <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16M11 13v2h2v-2" />}
      {m === "workforce" && <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM5 17l.7 1.8L7.5 19.5l-1.8.7L5 22l-.7-1.8L2.5 19.5l1.8-.7zM19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z" />}
    </svg>
  );
}

/* ───────────────────────── pills ───────────────────────── */

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand" | ModuleKey;

export function Pill({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill pill-${tone}`}>{dot && <span className="pill-dot" aria-hidden="true" />}{children}</span>;
}

const statusTone: Record<string, Tone> = {
  active: "ok", linked: "ok", sent: "ok", processed: "ok", paid: "ok", enabled: "ok",
  trialing: "info", queued: "info", pending: "info", received: "info", testing: "info", open: "info",
  past_due: "warn", failed: "warn", error: "warn", pending_review: "warn", suspended: "warn",
  canceled: "bad", disabled: "bad", dead: "bad", revoked: "bad", uncollectible: "bad", void: "bad",
};
export function StatusPill({ s }: { s: string }) {
  const text = s.replace(/_/g, " ");
  return <Pill tone={statusTone[s] ?? "neutral"} dot>{text.charAt(0).toUpperCase() + text.slice(1)}</Pill>;
}

/** The truthful sign-in status of a module. WSSO and the Directory start as not configured. */
export function SsoPill({ status }: { status: "not_configured" | "testing" | "enabled" | undefined }) {
  if (status === "enabled") return <Pill tone="ok" dot>SSO enabled</Pill>;
  if (status === "testing") return <Pill tone="info" dot>SSO testing · admins only</Pill>;
  return <Pill tone="neutral" dot>SSO not configured</Pill>;
}

/* ───────────────────────── buttons + forms ───────────────────────── */

export function Button({ variant = "primary", loading, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "text" | "soft"; loading?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${rest.className ?? ""}`} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Label + control + hint/error. The label wraps the control; the hint or error is
 * connected with aria-describedby and errors set aria-invalid.
 */
export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  const id = useId();
  const describedBy = error || hint ? `${id}-d` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, { "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <label className={`field ${error ? "has-error" : ""}`}>
      <span className="field-label">{label}{required && <span className="req" aria-hidden="true"> *</span>}</span>
      {control}
      {error ? <span id={describedBy} className="field-error" role="alert">{error}</span> : hint ? <span id={describedBy} className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <span className="input-affix">
      <input {...props} type={show ? "text" : "password"} />
      <button type="button" className="affix-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        <Icon name={show ? "eyeOff" : "eye"} size={17} />
      </button>
    </span>
  );
}

export function Alert({ tone = "bad", title, children }: { tone?: "bad" | "ok" | "info" | "warn"; title?: string; children: ReactNode }) {
  const icon: IconName = tone === "ok" ? "ok" : tone === "info" ? "info" : "alert";
  return (
    <div className={`alert alert-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={icon} size={18} className="alert-icon" />
      <div className="alert-body">{title && <strong className="alert-title">{title}</strong>}<div>{children}</div></div>
    </div>
  );
}

/* ───────────────────────── loading, empty, error ───────────────────────── */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div className="center-load" role="status"><span className="spin spin-lg" aria-hidden="true" /> <span className="dim">{label}…</span></div>;
}

export function Skeleton({ w = "100%", h = 14, r }: { w?: string | number; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

/** Placeholder rows while a table loads. */
export function SkeletonRows({ cols, rows = 4 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => <td key={c}><Skeleton w={c === 0 ? "70%" : "50%"} /></td>)}
        </tr>
      ))}
    </>
  );
}

export function Empty({ title, children, icon = "inbox", action }: { title: string; children?: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {children && <span className="dim">{children}</span>}
      {action}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert title="Couldn't load this">
      <span>{message}</span>{onRetry && <> <button type="button" className="link-btn" onClick={onRetry}>Try again</button></>}
    </Alert>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="dim page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** Tiny async loader hook. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    fn().then((d) => live && setData(d)).catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading: data === null && error === null, reload: () => setTick((t) => t + 1), setData };
}

/* ───────────────────────── dialogs ───────────────────────── */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible modal: labelled, traps focus, restores focus on close, closes on Escape. */
export function Modal({ title, description, onClose, children, size = "md" }: { title: string; description?: ReactNode; onClose: () => void; children: ReactNode; size?: "sm" | "md" | "lg" }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (el?.querySelector<HTMLElement>("[autofocus], input, select, textarea") ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); }
      if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, []);

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined}>
        <div className="modal-head">
          <div className="stack-xs">
            <h3 id={`${id}-t`}>{title}</h3>
            {description && <p id={`${id}-d`} className="dim small">{description}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmation for destructive or important actions. Shows its own progress and errors. */
export function ConfirmDialog({ title, body, confirmLabel, tone = "danger", onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; tone?: "danger" | "primary"; onConfirm: () => Promise<unknown>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = useCallback(async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work."); setBusy(false); }
  }, [onConfirm, onClose]);
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} size="sm">
      <div className="stack">
        <div className="dim">{body}</div>
        {err && <Alert>{err}</Alert>}
        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={tone} onClick={run} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Copy-to-clipboard button with feedback. */
type ToastItem = { id: number; text: string };
const toastListeners = new Set<(items: ToastItem[]) => void>();
let toastItems: ToastItem[] = [];
let toastSeq = 0;

export function toast(text: string) {
  const id = ++toastSeq;
  toastItems = [...toastItems, { id, text }];
  toastListeners.forEach((fn) => fn(toastItems));
  window.setTimeout(() => {
    toastItems = toastItems.filter((item) => item.id !== id);
    toastListeners.forEach((fn) => fn(toastItems));
  }, 3200);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    toastListeners.add(setItems);
    return () => { toastListeners.delete(setItems); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="toasts">
      {items.map((item) => <div key={item.id} className="toast" role="status">{item.text}</div>)}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <Button variant="ghost" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setState("ok"); toast("Copied"); } catch { setState("fail"); toast("Select and copy manually"); }
      setTimeout(() => setState("idle"), 2000);
    }}>
      <Icon name={state === "ok" ? "check" : "copy"} size={16} />
      {state === "ok" ? "Copied" : state === "fail" ? "Select and copy manually" : label}
    </Button>
  );
}

/** Horizontal usage meter (seats, quotas). */
export function Meter({ value, max, label }: { value: number; max: number | null; label: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <span className={`meter ${max !== null && value > max ? "is-over" : pct >= 90 ? "is-high" : ""}`} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max ?? undefined}>
      <span style={{ width: `${max ? pct : 0}%` }} />
    </span>
  );
}
