export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="of-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--surface-3)" stroke="var(--line-2)" />
      <circle cx="17" cy="20" r="8.5" fill="none" stroke="url(#of-grad)" strokeWidth="4" />
      <path d="M22.5 11.5h9M22.5 11.5v17M22.5 19.5h7" fill="none" stroke="var(--fg)" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={30} />
      <span>OmniForce</span>
    </span>
  );
}
