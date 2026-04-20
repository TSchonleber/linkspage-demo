import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Link, Page, ThemeId } from "@/lib/types";

const DEFAULT_PAGE: Page = {
  version: 1,
  name: "",
  bio: "",
  avatar: "",
  theme: "minimal",
  links: [],
};

type PageStore = {
  page: Page;
  publishedSlug?: string;
  editToken?: string;

  // Profile actions
  setName: (name: string) => void;
  setBio: (bio: string) => void;
  setAvatar: (avatar: string) => void;
  setTheme: (theme: ThemeId) => void;

  // Link actions
  addLink: (partial: Pick<Link, "label" | "url">) => void;
  updateLink: (id: string, partial: Partial<Omit<Link, "id">>) => void;
  removeLink: (id: string) => void;
  reorderLinks: (activeId: string, overId: string) => void;
  toggleLink: (id: string) => void;

  // Session actions
  loadFromExternal: (page: Page) => void;
  setPublished: (slug: string, token: string) => void;
  reset: () => void;
};

export const usePageStore = create<PageStore>()(
  persist(
    (set) => ({
      page: DEFAULT_PAGE,
      publishedSlug: undefined,
      editToken: undefined,

      setName: (name) =>
        set((state) => ({ page: { ...state.page, name } })),

      setBio: (bio) =>
        set((state) => ({ page: { ...state.page, bio } })),

      setAvatar: (avatar) =>
        set((state) => ({ page: { ...state.page, avatar } })),

      setTheme: (theme) =>
        set((state) => ({ page: { ...state.page, theme } })),

      addLink: (partial) =>
        set((state) => ({
          page: {
            ...state.page,
            links: [
              ...state.page.links,
              { id: nanoid(), enabled: true, ...partial },
            ],
          },
        })),

      updateLink: (id, partial) =>
        set((state) => ({
          page: {
            ...state.page,
            links: state.page.links.map((link) =>
              link.id === id ? { ...link, ...partial } : link
            ),
          },
        })),

      removeLink: (id) =>
        set((state) => ({
          page: {
            ...state.page,
            links: state.page.links.filter((link) => link.id !== id),
          },
        })),

      reorderLinks: (activeId, overId) =>
        set((state) => {
          const links = [...state.page.links];
          const activeIndex = links.findIndex((l) => l.id === activeId);
          const overIndex = links.findIndex((l) => l.id === overId);
          if (activeIndex === -1 || overIndex === -1) return state;
          const [removed] = links.splice(activeIndex, 1);
          links.splice(overIndex, 0, removed);
          return { page: { ...state.page, links } };
        }),

      toggleLink: (id) =>
        set((state) => ({
          page: {
            ...state.page,
            links: state.page.links.map((link) =>
              link.id === id ? { ...link, enabled: !link.enabled } : link
            ),
          },
        })),

      loadFromExternal: (page) => set({ page }),

      setPublished: (slug, token) =>
        set({ publishedSlug: slug, editToken: token }),

      reset: () =>
        set({ page: DEFAULT_PAGE, publishedSlug: undefined, editToken: undefined }),
    }),
    {
      name: "link-in-bio:v1",
    }
  )
);
