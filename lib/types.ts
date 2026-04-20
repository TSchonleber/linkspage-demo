export type ThemeId = "minimal" | "neon" | "sunset" | "paper" | "retro" | "dark";

export type Link = {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
};

export type Page = {
  version: 1;
  name: string;
  bio: string;
  avatar: string;
  theme: ThemeId;
  links: Link[];
};

export type CreatePageResponse = {
  slug: string;
  edit_token: string;
  page: Page;
};
