"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { publishPage } from "@/lib/api";
import { usePageStore } from "@/lib/store";

export function PublishButton() {
  const [loading, setLoading] = useState(false);

  const page = usePageStore((s) => s.page);
  const publishedSlug = usePageStore((s) => s.publishedSlug);
  const editToken = usePageStore((s) => s.editToken);
  const setPublished = usePageStore((s) => s.setPublished);

  const label = publishedSlug ? "Update" : "Publish";

  async function handlePublish() {
    setLoading(true);
    try {
      const result = await publishPage(page, editToken, publishedSlug);
      setPublished(result.slug, result.edit_token);

      const url = `${window.location.origin}/p/${result.slug}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard", {
        description: url,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      disabled={loading}
      onClick={handlePublish}
      size="sm"
      type="button"
    >
      <Share2 />
      {loading ? (publishedSlug ? "Updating…" : "Publishing…") : label}
    </Button>
  );
}
