// Real screenshots of the Omni Force Vector hub, captured with sample data.
// Each image ships in two widths; the browser picks the right one.

export type ShotName =
  | "dashboard" | "organization" | "billing" | "signup"
  | "module-wsso" | "module-directory" | "module-workforce";

const tall = new Set<ShotName>(["module-wsso", "module-directory", "module-workforce"]);

export function Screenshot({ name, alt, caption, url = "Omni Force Vector hub", priority = false, sizes = "(max-width: 1080px) 100vw, 600px" }: {
  name: ShotName; alt: string; caption?: string; url?: string; priority?: boolean; sizes?: string;
}) {
  const h = tall.has(name) ? 615 : 600;
  return (
    <figure className="shot">
      <div className="shot-frame">
        <div className="shot-chrome" aria-hidden="true"><span /><span /><span /><em>{url}</em></div>
        <img
          src={`/screens/${name}-960.webp`}
          srcSet={`/screens/${name}-960.webp 960w, /screens/${name}-1600.webp 1600w`}
          sizes={sizes}
          width={960}
          height={h}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Hero: the desktop dashboard with the phone layout overlapping it. */
export function HeroShowcase() {
  return (
    <figure className="showcase">
      <div className="showcase-stage">
      <div className="shot-frame showcase-desktop">
        <div className="shot-chrome" aria-hidden="true"><span /><span /><span /><em>Omni Force Vector hub</em></div>
        <img
          src="/screens/dashboard-960.webp"
          srcSet="/screens/dashboard-960.webp 960w, /screens/dashboard-1600.webp 1600w"
          sizes="(max-width: 1080px) 100vw, 640px"
          width={960}
          height={600}
          alt="The Omni Force Vector dashboard: Drone Directory, WSSO and Workforce 2.0 cards showing plan, access and sign-in status"
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <div className="showcase-phone" aria-hidden="true">
        <img src="/screens/dashboard-mobile-400.webp" srcSet="/screens/dashboard-mobile-400.webp 400w, /screens/dashboard-mobile-780.webp 780w" sizes="200px" width={400} height={866} alt="" decoding="async" />
      </div>
      </div>
      <figcaption>The Omni Force Vector hub on desktop and mobile. Sample data shown.</figcaption>
    </figure>
  );
}
