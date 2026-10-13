// Header/footer mark: the emblem cropped from the logo, with the name as real text
// so it stays legible at small sizes. The full stacked logo is used in the hero.
export function Wordmark() {
  return (
    <span className="wordmark">
      <img src="/omniforce-vector-emblem.webp" alt="" width={428} height={160} />
      <span className="wordmark-text">Omni<span className="wordmark-accent">Force</span>Vector</span>
    </span>
  );
}
