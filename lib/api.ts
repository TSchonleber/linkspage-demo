import { CreatePageResponseSchema, PageSchema } from "@/lib/schema";
import type { CreatePageResponse, Page } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function handleResponse(res: Response, context: string): Promise<unknown> {
  if (!res.ok) {
    let message = `${context}: HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message += ` — ${body.detail}`;
      else if (typeof body?.message === "string") message += ` — ${body.message}`;
    } catch {
      // ignore parse errors on error bodies
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * Publish or update a page.
 *
 * - First publish: POST /api/pages → returns CreatePageResponse
 * - Subsequent publishes (editToken + slug already in store): PUT /api/pages/<slug>
 *   with X-Edit-Token header → backend returns Page directly;
 *   we reconstruct the CreatePageResponse shape using the known slug/token.
 */
export async function publishPage(
  page: Page,
  editToken?: string,
  publishedSlug?: string
): Promise<CreatePageResponse> {
  const isUpdate = Boolean(editToken && publishedSlug);

  const url = isUpdate
    ? `${BASE}/api/pages/${publishedSlug}`
    : `${BASE}/api/pages`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (isUpdate && editToken) {
    headers["X-Edit-Token"] = editToken;
  }

  const res = await fetch(url, {
    method: isUpdate ? "PUT" : "POST",
    headers,
    body: JSON.stringify(page),
  });

  const data = await handleResponse(
    res,
    isUpdate ? "Update page" : "Publish page"
  );

  if (isUpdate) {
    // PUT returns the updated Page directly — wrap into CreatePageResponse shape
    const parsed = PageSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Update page: server returned unexpected shape");
    }
    return {
      slug: publishedSlug!,
      edit_token: editToken!,
      page: parsed.data as Page,
    };
  }

  // POST returns full CreatePageResponse
  const parsed = CreatePageResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Publish page: server returned unexpected shape");
  }
  return parsed.data as CreatePageResponse;
}

/**
 * Fetch a published page by slug.
 * Returns null on 404; throws on other non-2xx responses.
 */
export async function fetchPage(slug: string): Promise<Page | null> {
  const res = await fetch(`${BASE}/api/pages/${slug}`, {
    // Never serve stale published pages from the browser cache
    cache: "no-store",
  });

  if (res.status === 404) return null;

  const data = await handleResponse(res, `Fetch page "${slug}"`);
  const parsed = PageSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Fetch page "${slug}": server returned unexpected shape`);
  }
  return parsed.data as Page;
}
