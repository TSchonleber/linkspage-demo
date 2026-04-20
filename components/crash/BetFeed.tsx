"use client";

import React from "react";
import { type CrashBet } from "@/lib/crash";

const SOL_PER_LAMPORT = 1e-9;

function truncatePubkey(pubkey: string): string {
  if (pubkey.startsWith("DEMO")) return pubkey.slice(0, 8) + "…";
  if (pubkey.length <= 12) return pubkey;
  return pubkey.slice(0, 4) + "…" + pubkey.slice(-4);
}

interface BetFeedProps {
  bets: CrashBet[];
}

export default function BetFeed({ bets }: BetFeedProps) {
  if (bets.length === 0) {
    return (
      <div className="bet-feed bet-feed--empty">
        No bets placed yet this round.
      </div>
    );
  }

  return (
    <div className="bet-feed" role="log" aria-live="polite" aria-label="Live bets">
      <div className="bet-feed__header">
        <span>Player</span>
        <span>Amount</span>
        <span>Status</span>
      </div>
      <ul className="bet-feed__list">
        {bets.map((bet) => {
          const cashedOut = bet.cashout_multiplier_x100 !== null;
          const solAmount = (bet.bet_lamports * SOL_PER_LAMPORT).toFixed(4);
          return (
            <li key={bet.bet_id} className="bet-feed__row">
              <span className="bet-feed__pubkey" title={bet.player_pubkey}>
                {truncatePubkey(bet.player_pubkey)}
              </span>
              <span className="bet-feed__amount">{solAmount} SOL</span>
              <span
                className="bet-feed__status"
                style={{ color: cashedOut ? "#10b981" : "rgba(255,255,255,0.45)" }}
              >
                {cashedOut
                  ? `Cashed @ ${(bet.cashout_multiplier_x100! / 100).toFixed(2)}x`
                  : "In Round"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
