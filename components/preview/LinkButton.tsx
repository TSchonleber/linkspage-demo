"use client";

import type { Link } from "@/lib/types";

type LinkButtonProps = {
  link: Link;
};

export default function LinkButton({ link }: LinkButtonProps) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full text-center px-6 py-4 rounded-[var(--radius,0.5rem)] bg-[var(--link-bg,rgb(241,245,249))] text-[var(--link-fg,black)] hover:bg-[var(--link-hover,rgb(226,232,240))] transition font-medium"
    >
      {link.label}
    </a>
  );
}
