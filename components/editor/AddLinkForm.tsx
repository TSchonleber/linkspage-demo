"use client";

import { FormEvent, useState } from "react";

import { z } from "zod";

import { usePageStore } from "@/lib/store";

const addLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required.")
    .max(80, "Label must be 80 characters or fewer."),
  url: z
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
      { message: "Use a valid https://, http://, mailto:, or tel: URL." },
    ),
});

type FormErrors = {
  label?: string;
  url?: string;
};

export function AddLinkForm() {
  const addLink = usePageStore((state) => state.addLink);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = addLinkSchema.safeParse({ label, url });

    if (!parsed.success) {
      const nextErrors: FormErrors = {};

      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "label") {
          nextErrors.label = issue.message;
        }
        if (issue.path[0] === "url") {
          nextErrors.url = issue.message;
        }
      }

      setErrors(nextErrors);
      return;
    }

    addLink({
      label: parsed.data.label,
      url: parsed.data.url,
    });

    setLabel("");
    setUrl("");
    setErrors({});
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-900">Add Link</h2>
        <p className="text-xs text-slate-500">Append a new destination to your profile page.</p>
      </header>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Label</span>
          <input
            className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-900/10 ${
              errors.label
                ? "border-red-500 focus:border-red-500"
                : "border-slate-300 focus:border-slate-900"
            }`}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Portfolio"
            type="text"
            value={label}
          />
          {errors.label ? <p className="text-xs text-red-600">{errors.label}</p> : null}
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">URL</span>
          <input
            className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-slate-900/10 ${
              errors.url
                ? "border-red-500 focus:border-red-500"
                : "border-slate-300 focus:border-slate-900"
            }`}
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            type="url"
            value={url}
          />
          {errors.url ? <p className="text-xs text-red-600">{errors.url}</p> : null}
        </label>

        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/30"
          type="submit"
        >
          Add link
        </button>
      </form>
    </section>
  );
}
