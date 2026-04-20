import type { ThemeId } from "@/lib/types";

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  preview: string;
  description: string;
};

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "minimal",
    name: "Minimal",
    preview: "#ffffff",
    description: "Neutral, clean, and quietly polished.",
  },
  {
    id: "neon",
    name: "Neon",
    preview: "#0b0020",
    description: "High-contrast dark mode with bright accents.",
  },
  {
    id: "sunset",
    name: "Sunset",
    preview: "#ff6e7f",
    description: "Warm coral gradient with soft card surfaces.",
  },
] as const;

export function themeClassName(id: ThemeId): string {
  return `theme-${id}`;
}
