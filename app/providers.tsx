"use client";

import React from "react";
import { SolanaProviders } from "@/lib/solana";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
