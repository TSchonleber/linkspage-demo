"use client";

import { useMemo } from "react";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { z } from "zod";

import { usePageStore } from "@/lib/store";
import type { Link } from "@/lib/types";

const urlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .max(2048, "URL must be 2048 characters or fewer.")
  .refine(
    (value) => {
      if (value.startsWith("mailto:") || value.startsWith("tel:")) {
        return true;
      }

      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    {
      message: "Use a valid https://, http://, mailto:, or tel: URL.",
    },
  );

type LinkRowProps = {
  link: Link;
};

export function LinkRow({ link }: LinkRowProps) {
  const updateLink = usePageStore((state) => state.updateLink);
  const toggleLink = usePageStore((state) => state.toggleLink);
  const removeLink = usePageStore((state) => state.removeLink);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: link.id,
    });

  const urlIssue = useMemo(() => {
    const parsed = urlSchema.safeParse(link.url);
    return parsed.success ? null : parsed.error.issues[0]?.message ?? "Invalid URL.";
  }, [link.url]);

  return (
    <div
      className={`rounded-md border bg-white p-3 shadow-sm transition ${
        isDragging ? "border-slate-400 shadow-md" : "border-slate-200"
      } ${!link.enabled ? "opacity-70" : ""}`}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={`Reorder link ${link.label || link.id}`}
          className="mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          type="button"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Label
            </span>
            <input
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              maxLength={80}
              onChange={(event) => updateLink(link.id, { label: event.target.value })}
              placeholder="Label"
              type="text"
              value={link.label}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              URL
            </span>
            <input
              className={`h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-900/10 ${
                urlIssue
                  ? "border-red-500 focus:border-red-500"
                  : "border-slate-300 focus:border-slate-900"
              }`}
              maxLength={2048}
              onChange={(event) => updateLink(link.id, { url: event.target.value })}
              placeholder="https://example.com"
              type="url"
              value={link.url}
            />
            {urlIssue ? <p className="text-xs text-red-600">{urlIssue}</p> : null}
          </label>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              checked={link.enabled}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/30"
              onChange={() => toggleLink(link.id)}
              type="checkbox"
            />
            On
          </label>

          <button
            className="inline-flex h-8 items-center justify-center rounded-md border border-red-200 px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            onClick={() => removeLink(link.id)}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
