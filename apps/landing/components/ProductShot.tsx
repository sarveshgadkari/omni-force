// Screenshots of the products themselves (not the Omni Force Vector hub).
// To add one: put <key>-760.webp and <key>-full.webp in public/products/ and
// add an entry below. Products without an entry show a placeholder.
import { ProductIcon } from "./Icons";
import type { ModuleKey } from "@/lib/site";

const shots: Partial<Record<ModuleKey, { w: number; h: number; label: string; alt: string }>> = {
  wsso: {
    w: 1356, h: 641, label: "wsso.tlbisbig.world",
    alt: "WSSO dashboard with clock-in, who is working now, and team size, open, in-progress, overdue and pending TACTICs counts",
  },
  workforce: {
    w: 1342, h: 692, label: "Workforce 2.0 desktop app",
    alt: "Workforce 2.0 tech console with the AI Chief Executive on standby, ready for a voice or chat conversation",
  },
};

const names: Record<ModuleKey, string> = { wsso: "WSSO", directory: "Drone Directory", workforce: "Workforce 2.0" };

export function ProductShot({ m, compact = false, sizes }: { m: ModuleKey; compact?: boolean; sizes?: string }) {
  const s = shots[m];
  return (
    <div className={`shot-frame product-shot ${compact ? "is-compact" : ""} m-${m}`}>
      {!compact && <div className="shot-chrome" aria-hidden="true"><span /><span /><span /><em>{s?.label ?? names[m]}</em></div>}
      {s ? (
        <img
          src={`/products/${m}-760.webp`}
          srcSet={`/products/${m}-760.webp 760w, /products/${m}-full.webp ${s.w}w`}
          sizes={sizes ?? (compact ? "(max-width: 620px) 100vw, (max-width: 1080px) 50vw, 380px" : "(max-width: 1240px) 100vw, 1200px")}
          width={s.w}
          height={s.h}
          alt={s.alt}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="shot-placeholder" role="img" aria-label={`${names[m]} screenshot coming soon`}>
          <span className="strip-ico"><ProductIcon m={m} size={compact ? 22 : 30} /></span>
          <span>{names[m]} preview coming soon</span>
        </div>
      )}
    </div>
  );
}
