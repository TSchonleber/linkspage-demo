"use client";

type AvatarProps = {
  src?: string;
  name?: string;
  size?: number;
};

function getInitials(name?: string): string {
  if (!name || !name.trim()) return "?";
  const words = name.trim().split(/\s+/);
  const letters = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return letters.toUpperCase();
}

export default function Avatar({ src, name, size = 96 }: AvatarProps) {
  const style = { width: size, height: size, minWidth: size };

  if (src && src.trim().length > 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "Avatar"}
        style={style}
        className="rounded-full border-2 border-neutral-200 object-cover"
      />
    );
  }

  const initials = getInitials(name);

  return (
    <div
      style={style}
      className="rounded-full border-2 border-neutral-200 bg-neutral-200 text-neutral-700 flex items-center justify-center font-semibold select-none"
    >
      <span style={{ fontSize: size * 0.36 }}>{initials}</span>
    </div>
  );
}
