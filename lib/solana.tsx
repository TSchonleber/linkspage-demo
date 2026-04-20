"use client";

import "@solana/wallet-adapter-react-ui/styles.css";
import React from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

export const CLUSTER: "devnet" | "mainnet-beta" =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as "devnet" | "mainnet-beta") ?? "devnet";

export const RPC_ENDPOINT: string =
  process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT ?? clusterApiUrl(CLUSTER);

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

export function SolanaProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
