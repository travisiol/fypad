/** FYPAD mark: a coin with a vertical 9:16 video window punched through it, amber rim (flat version of brand/logo-1024.png). */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#FFB21A" />
      <circle cx="32" cy="32" r="27.5" fill="#101010" />
      <rect x="24.5" y="15" width="15" height="34" rx="7.5" fill="#F6F1E8" />
    </svg>
  );
}
