import { z } from "zod";

import type { Page } from "@/lib/types";

// Mirrors backend/models.py Pydantic schema (§6 of design spec)

export const LinkSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  url: z.string().min(1).max(2048),
  enabled: z.boolean().default(true),
});

export const PageSchema = z.object({
  version: z.literal(1),
  name: z.string().max(80),
  bio: z.string().max(160).default(""),
  // data URL or empty — capped at 500KB to match backend storage limit
  avatar: z.string().max(500_000).default(""),
  theme: z
    .enum(["minimal", "neon", "sunset", "paper", "retro", "dark"])
    .default("minimal"),
  links: z.array(LinkSchema).max(50).default([]),
});

export const CreatePageResponseSchema = z.object({
  slug: z.string(),
  edit_token: z.string(),
  page: PageSchema,
});

export type CreatePageResponseParsed = z.infer<typeof CreatePageResponseSchema>;

/**
 * Safe parse an unknown input into a Page.
 * Returns the typed Page on success, null on validation failure.
 */
export function safeParsePage(input: unknown): Page | null {
  const result = PageSchema.safeParse(input);
  if (!result.success) return null;
  // The parsed data satisfies the Page type — the literal version:1
  // and theme enum keep both types aligned.
  return result.data as Page;
}
