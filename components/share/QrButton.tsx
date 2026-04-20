"use client";

import { QrCode } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function QrButton() {
  function handleClick() {
    toast.info("Coming soon", {
      description: "QR code generation will be available in a future update.",
    });
  }

  return (
    <Button onClick={handleClick} size="sm" type="button" variant="outline">
      <QrCode />
      QR Code
    </Button>
  );
}
