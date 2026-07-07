export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-fog">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-jade" />
        <span className="font-mono text-sm">{label}…</span>
      </div>
    </div>
  );
}
