"use client";

import { AddLinkForm } from "@/components/editor/AddLinkForm";
import { LinksEditor } from "@/components/editor/LinksEditor";
import { ProfileEditor } from "@/components/editor/ProfileEditor";
import { ThemePicker } from "@/components/editor/ThemePicker";
import { usePageStore } from "@/lib/store";
import { themeClassName } from "@/lib/themes";
import type { Page } from "@/lib/types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) {
    return "U";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function PreviewPane({ page }: { page: Page }) {
  return (
    <div className={`theme-shell ${themeClassName(page.theme)}`}>
      <article className="theme-card mx-auto w-full max-w-md p-6">
        <div className="mb-4 flex justify-center">
          {page.avatar ? (
            <img
              alt={`${page.name || "User"} avatar`}
              className="size-20 rounded-full border border-black/10 object-cover"
              src={page.avatar}
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full border border-black/10 bg-white/60 text-lg font-semibold">
              {initialsFromName(page.name)}
            </div>
          )}
        </div>

        <div className="text-center">
          <h2 className="theme-name text-2xl font-semibold">
            {page.name || "Your Name"}
          </h2>
          {page.bio ? (
            <p className="theme-bio mt-2 text-sm">{page.bio}</p>
          ) : (
            <p className="theme-bio mt-2 text-sm opacity-70">
              Add a short bio to tell people what you do.
            </p>
          )}
        </div>

        <div className="mt-6 space-y-2">
          {page.links.filter((link) => link.enabled).length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-black/20 p-3 text-center text-sm opacity-70">
              Your enabled links will appear here.
            </div>
          ) : (
            page.links
              .filter((link) => link.enabled)
              .map((link) => (
                <a
                  className="theme-link block rounded-[var(--radius)] px-4 py-3 text-center text-sm font-medium no-underline"
                  href={link.url || "#"}
                  key={link.id}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.label || "Untitled Link"}
                </a>
              ))
          )}
        </div>
      </article>
    </div>
  );
}

export default function Home() {
  const page = usePageStore((state) => state.page);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h1 className="text-sm font-semibold tracking-wide text-slate-900">
              Link-in-Bio Builder
            </h1>
            <p className="text-xs text-slate-500">
              Edit on the left, preview on the right.
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            type="button"
          >
            Publish
          </button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="max-h-[calc(100vh-9rem)] space-y-4 overflow-y-auto pr-1">
            <ProfileEditor />
            <ThemePicker />
            <LinksEditor />
            <AddLinkForm />
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <PreviewPane page={page} />
          </section>
        </div>
      </div>
    </main>
  );
}
