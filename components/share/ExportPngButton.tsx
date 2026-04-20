"use client";

import { ImageDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ExportPngButton() {
  function handleClick() {
    toast.info("Coming soon", {
      description: "PNG export will be available in a future update.",
    });
  }

  return (
    <Button onClick={handleClick} size="sm" type="button" variant="outline">
      <ImageDown />
      Export PNG
    </Button>
  );
}
