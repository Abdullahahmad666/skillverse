interface Props {
  name: string;
  url?: string | null;
  size?: "sm" | "lg";
}

export function Avatar({ name, url, size = "sm" }: Props) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const cls =
    size === "lg"
      ? "h-20 w-20 text-2xl"
      : "h-9 w-9 text-xs";

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${cls} rounded-full border border-mist object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${cls} flex items-center justify-center rounded-full bg-jade-tint font-mono font-semibold text-jade-deep`}
    >
      {initials || "?"}
    </div>
  );
}
