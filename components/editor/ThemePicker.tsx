"use client";

import { usePageStore } from "@/lib/store";
import { THEMES } from "@/lib/themes";

export function ThemePicker() {
  const activeTheme = usePageStore((state) => state.page.theme);
  const setTheme = usePageStore((state) => state.setTheme);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-900">Theme</h2>
        <p className="text-xs text-slate-500">
          Pick the look users see on your published page.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {THEMES.map((theme) => {
          const isActive = theme.id === activeTheme;

          return (
            <button
              aria-pressed={isActive}
              className={`rounded-md border p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-slate-900/30 ${
                isActive
                  ? "border-slate-900 bg-slate-100"
                  : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
              }`}
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              type="button"
            >
              <span
                aria-hidden
                className="mb-2 block h-8 w-full rounded-sm border border-slate-200"
                style={{ background: theme.preview }}
              />
              <span className="block text-xs font-semibold text-slate-900">{theme.name}</span>
              <span className="block text-[11px] text-slate-500">{theme.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
