// 'use client' — needed because the editor preview drives this from a Zustand store
// (app/page.tsx feeds it live state). When rendered from app/p/[slug]/page.tsx
// (Server Component), Page is passed as plain JSON so the client boundary is harmless.
"use client";

import type { Page } from "@/lib/types";
import { themeClassName } from "@/lib/themes";
import Avatar from "@/components/preview/Avatar";
import LinkButton from "@/components/preview/LinkButton";

type BioPageProps = {
  page: Page;
};

export function BioPage({ page }: BioPageProps) {
  return (
    <div
      className={`${themeClassName(page.theme)} min-h-screen w-full bg-[var(--bg,white)] text-[var(--fg,black)]`}
    >
      <div className="max-w-md mx-auto py-12 px-6 flex flex-col items-center gap-6">
        <Avatar src={page.avatar} name={page.name} />

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {page.name || "Your Name"}
          </h1>
          {page.bio && (
            <p className="text-sm opacity-70">{page.bio}</p>
          )}
        </div>

        <div className="w-full flex flex-col gap-3">
          {page.links
            .filter((l) => l.enabled)
            .map((link) => (
              <LinkButton key={link.id} link={link} />
            ))}
        </div>
      </div>
    </div>
  );
}
