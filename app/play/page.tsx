"use client";

import React, { useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import CrashChart from "@/components/crash/CrashChart";
import BetPanel from "@/components/crash/BetPanel";
import RecentRoundsTicker from "@/components/crash/RecentRoundsTicker";
import BetFeed from "@/components/crash/BetFeed";
import { type CrashRound } from "@/lib/crash";
import { CLUSTER } from "@/lib/solana";

export default function PlayPage() {
  const [currentRound, setCurrentRound] = useState<CrashRound | null>(null);

  return (
    <>
      {/* Scoped dark theme vars — does not affect / or /p/[slug] */}
      <style>{`
        .crash-root {
          --cr-bg: #0a0a0a;
          --cr-surface: #111111;
          --cr-surface2: #1a1a1a;
          --cr-border: rgba(255,255,255,0.08);
          --cr-fg: #ffffff;
          --cr-fg-muted: rgba(255,255,255,0.45);
          --cr-green: #10b981;
          --cr-red: #ef4444;
          --cr-yellow: #f59e0b;
          min-height: 100vh;
          background: var(--cr-bg);
          color: var(--cr-fg);
          font-family: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
        }

        /* ── Top bar ── */
        .crash-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--cr-border);
          background: var(--cr-surface);
        }
        .crash-topbar__brand {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--cr-fg);
        }
        .crash-topbar__brand span {
          color: var(--cr-green);
        }
        .crash-topbar__cluster {
          font-size: 11px;
          color: var(--cr-fg-muted);
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
          padding: 2px 8px;
          margin-left: 10px;
          text-transform: uppercase;
        }

        /* ── Layout grid ── */
        .crash-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          padding: 16px;
          max-width: 1400px;
          margin: 0 auto;
        }
        @media (min-width: 1024px) {
          .crash-layout {
            grid-template-columns: 1fr 340px;
            align-items: start;
          }
        }

        /* ── Chart area ── */
        .crash-chart-col {}
        .crash-chart-wrap {
          background: var(--cr-surface);
          border: 1px solid var(--cr-border);
          border-radius: 12px;
          height: 360px;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .crash-chart-wrap { height: 420px; }
        }

        /* ── Ticker ── */
        .ticker {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: var(--cr-surface);
          border: 1px solid var(--cr-border);
          border-radius: 10px;
          margin-top: 12px;
          overflow: hidden;
        }
        .ticker__label {
          font-size: 11px;
          color: var(--cr-fg-muted);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .ticker__scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .ticker__scroll::-webkit-scrollbar { display: none; }
        .ticker__pill {
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          padding: 2px 8px;
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          cursor: default;
        }
        .ticker__loading {
          font-size: 12px;
          color: var(--cr-fg-muted);
        }

        /* ── Right column ── */
        .crash-right-col {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* ── BetPanel ── */
        .bet-panel {
          background: var(--cr-surface);
          border: 1px solid var(--cr-border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .bet-panel__wallet-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: stretch;
        }
        .bet-panel__divider {
          text-align: center;
          font-size: 11px;
          color: var(--cr-fg-muted);
        }
        .bet-panel__demo-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--cr-border);
          color: var(--cr-fg);
          border-radius: 8px;
          padding: 10px;
          font-size: 13px;
          cursor: pointer;
          transition: background 150ms ease;
          font-family: inherit;
        }
        .bet-panel__demo-btn:hover {
          background: rgba(255,255,255,0.10);
        }
        .bet-panel__demo-badge {
          font-size: 12px;
          color: var(--cr-yellow);
          background: rgba(245,158,11,0.10);
          border: 1px solid rgba(245,158,11,0.25);
          border-radius: 8px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .bet-panel__demo-exit {
          background: none;
          border: none;
          color: var(--cr-fg-muted);
          font-size: 11px;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          text-decoration: underline;
        }
        .bet-panel__wallet-connected {
          display: flex;
        }
        .bet-panel__success {
          background: rgba(16,185,129,0.10);
          border: 1px solid rgba(16,185,129,0.25);
          border-radius: 8px;
          padding: 14px;
          font-size: 14px;
          color: var(--cr-green);
          line-height: 1.6;
        }
        .bet-panel__success-amount {
          font-size: 20px;
          font-weight: 700;
        }
        .bet-panel__form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .bet-panel__label {
          font-size: 11px;
          color: var(--cr-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .bet-panel__input-row {
          display: flex;
          gap: 8px;
        }
        .bet-panel__input {
          flex: 1;
          background: var(--cr-surface2);
          border: 1px solid var(--cr-border);
          border-radius: 8px;
          color: var(--cr-fg);
          padding: 10px 12px;
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: border-color 150ms ease;
          min-width: 0;
        }
        .bet-panel__input:focus {
          border-color: var(--cr-green);
        }
        .bet-panel__input:disabled {
          opacity: 0.45;
        }
        .bet-panel__quickpick {
          display: flex;
          gap: 6px;
        }
        .bet-panel__quick-btn {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--cr-border);
          border-radius: 6px;
          color: var(--cr-fg-muted);
          font-size: 12px;
          padding: 6px 2px;
          cursor: pointer;
          font-family: inherit;
          transition: background 150ms ease, color 150ms ease;
        }
        .bet-panel__quick-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.10);
          color: var(--cr-fg);
        }
        .bet-panel__quick-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .bet-panel__action-btn {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: none;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          background: rgba(255,255,255,0.08);
          color: var(--cr-fg-muted);
          transition: background 180ms ease, color 180ms ease;
        }
        .bet-panel__action-btn--active {
          background: var(--cr-green);
          color: #000;
        }
        .bet-panel__action-btn--active:hover {
          background: #0ea874;
        }
        .bet-panel__action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .bet-panel__cashout-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .bet-panel__cashout-btn {
          width: 100%;
          padding: 18px;
          border-radius: 10px;
          border: none;
          font-size: 18px;
          font-weight: 800;
          font-family: inherit;
          cursor: pointer;
          background: var(--cr-red);
          color: #fff;
          letter-spacing: 0.02em;
          transition: background 150ms ease, transform 120ms ease;
          animation: cashout-pulse 800ms ease-in-out infinite alternate;
        }
        @keyframes cashout-pulse {
          from { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          to { box-shadow: 0 0 20px 4px rgba(239,68,68,0.15); }
        }
        .bet-panel__cashout-btn:hover:not(:disabled) {
          background: #dc2626;
          transform: scale(1.01);
        }
        .bet-panel__cashout-btn:disabled { opacity: 0.55; cursor: not-allowed; animation: none; }
        .bet-panel__cashout-note {
          font-size: 11px;
          color: var(--cr-fg-muted);
          text-align: center;
          margin: 0;
        }
        .bet-panel__pending {
          font-size: 13px;
          color: var(--cr-yellow);
          text-align: center;
          padding: 10px;
          background: rgba(245,158,11,0.08);
          border-radius: 8px;
        }
        .bet-panel__error {
          font-size: 12px;
          color: var(--cr-red);
          margin: 0;
        }

        /* ── BetFeed ── */
        .bet-feed {
          background: var(--cr-surface);
          border: 1px solid var(--cr-border);
          border-radius: 12px;
          padding: 14px;
          max-height: 280px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .bet-feed--empty {
          font-size: 12px;
          color: var(--cr-fg-muted);
          text-align: center;
          padding: 20px 14px;
        }
        .bet-feed__header {
          display: grid;
          grid-template-columns: 1fr 80px 110px;
          font-size: 10px;
          color: var(--cr-fg-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--cr-border);
          margin-bottom: 6px;
        }
        .bet-feed__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .bet-feed__row {
          display: grid;
          grid-template-columns: 1fr 80px 110px;
          font-size: 12px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          align-items: center;
        }
        .bet-feed__pubkey {
          color: var(--cr-fg-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bet-feed__amount {
          color: var(--cr-fg);
        }
        .bet-feed__status {
          font-weight: 600;
          font-size: 11px;
        }

        /* Wallet adapter button styling override — minimal */
        .wallet-adapter-button {
          background: rgba(255,255,255,0.08) !important;
          color: var(--cr-fg) !important;
          border-radius: 8px !important;
          font-family: inherit !important;
          font-size: 13px !important;
          height: 40px !important;
          padding: 0 16px !important;
          border: 1px solid var(--cr-border) !important;
          transition: background 150ms ease !important;
        }
        .wallet-adapter-button:hover {
          background: rgba(255,255,255,0.13) !important;
        }

        /* Accessible hidden */
        .sr-only {
          position: absolute;
          width: 1px; height: 1px;
          padding: 0; margin: -1px;
          overflow: hidden;
          clip: rect(0,0,0,0);
          white-space: nowrap;
          border: 0;
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .bet-panel__cashout-btn { animation: none; }
          .bet-panel__action-btn,
          .bet-panel__demo-btn,
          .bet-panel__quick-btn { transition: none; }
        }
      `}</style>

      <div className="crash-root">
        {/* Top bar */}
        <header className="crash-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
            <span className="crash-topbar__brand">
              linkspage <span>play</span>
            </span>
            <span className="crash-topbar__cluster">{CLUSTER}</span>
          </div>
          <WalletMultiButton />
        </header>

        {/* Main layout */}
        <main className="crash-layout">
          {/* Left — chart + ticker */}
          <div className="crash-chart-col">
            <CrashChart onRoundUpdate={setCurrentRound} />
            <RecentRoundsTicker />
          </div>

          {/* Right — bet panel + feed */}
          <div className="crash-right-col">
            <BetPanel round={currentRound} />
            <BetFeed bets={currentRound?.bets ?? []} />
          </div>
        </main>
      </div>
    </>
  );
}
