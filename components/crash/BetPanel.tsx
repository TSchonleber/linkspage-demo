"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  type CrashRound,
  type RoundStatus,
  computeMultiplier,
  placeBet,
  cashOut,
} from "@/lib/crash";

const SOL_PER_LAMPORT = 1e-9;
const LAMPORTS_PER_SOL = 1_000_000_000;

// Generate a demo pubkey (not a real base58 key; backend must allow it)
function makeDemoPubkey(): string {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `DEMO${suffix}`;
}

interface CashoutResult {
  multiplier: string;
  solAmount: string;
}

interface BetPanelProps {
  round: CrashRound | null;
}

export default function BetPanel({ round }: BetPanelProps) {
  const { publicKey, connected } = useWallet();

  // Demo mode state
  const [demoPubkey] = useState<string>(makeDemoPubkey);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const effectivePubkey: string | null = connected
    ? publicKey?.toBase58() ?? null
    : isDemoMode
    ? demoPubkey
    : null;

  // Bet form state
  const [betSol, setBetSol] = useState("0.01");
  const [betId, setBetId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashoutResult, setCashoutResult] = useState<CashoutResult | null>(null);

  // Live multiplier for cashout button label
  const [liveMult, setLiveMult] = useState("1.00");
  const rafRef = useRef<number>(0);

  const status: RoundStatus | null = round?.status ?? null;
  const inRound = betId !== null && status === "running";

  // Update live multiplier on each animation frame during "running"
  useEffect(() => {
    if (!inRound || !round) return;

    const tick = () => {
      const mult = computeMultiplier(round.running_starts_ms, Date.now());
      setLiveMult(mult.toFixed(2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [inRound, round]);

  // Reset on new round
  useEffect(() => {
    if (status === "betting" && cashoutResult !== null) {
      // New round started — clear result
      setBetId(null);
      setCashoutResult(null);
      setError(null);
    }
  }, [status, cashoutResult]);

  const handleBet = useCallback(async () => {
    if (!round || !effectivePubkey) return;
    setError(null);
    setPlacing(true);
    try {
      const lamports = Math.round(parseFloat(betSol) * LAMPORTS_PER_SOL);
      if (isNaN(lamports) || lamports <= 0) {
        setError("Enter a valid bet amount.");
        return;
      }
      const result = await placeBet({
        round_id: round.round_id,
        player_pubkey: effectivePubkey,
        bet_lamports: lamports,
      });
      setBetId(result.bet_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bet failed");
    } finally {
      setPlacing(false);
    }
  }, [round, effectivePubkey, betSol]);

  const handleCashout = useCallback(async () => {
    if (!effectivePubkey || betId === null) return;
    setError(null);
    setCashingOut(true);
    try {
      const result = await cashOut({
        bet_id: betId,
        player_pubkey: effectivePubkey,
      });
      setCashoutResult({
        multiplier: (result.cashout_multiplier_x100 / 100).toFixed(2),
        solAmount: (result.payout_lamports * SOL_PER_LAMPORT).toFixed(5),
      });
      setBetId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cashout failed");
    } finally {
      setCashingOut(false);
    }
  }, [betId, effectivePubkey]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const canBet =
    effectivePubkey !== null &&
    status === "betting" &&
    betId === null &&
    !placing;

  const canCashout = effectivePubkey !== null && inRound && !cashingOut;

  return (
    <div className="bet-panel">
      {/* Wallet connection / demo mode */}
      {!connected && !isDemoMode && (
        <div className="bet-panel__wallet-row">
          <WalletMultiButton />
          <div className="bet-panel__divider">or</div>
          <button
            className="bet-panel__demo-btn"
            onClick={() => setIsDemoMode(true)}
          >
            Try with play SOL
          </button>
        </div>
      )}

      {isDemoMode && !connected && (
        <div className="bet-panel__demo-badge">
          Demo Mode — {demoPubkey.slice(0, 8)}…
          <button
            className="bet-panel__demo-exit"
            onClick={() => setIsDemoMode(false)}
          >
            Exit
          </button>
        </div>
      )}

      {connected && (
        <div className="bet-panel__wallet-connected">
          <WalletMultiButton />
        </div>
      )}

      {/* Cashout success */}
      {cashoutResult && (
        <div className="bet-panel__success">
          Cashed out at {cashoutResult.multiplier}x
          <br />
          <span className="bet-panel__success-amount">
            +{cashoutResult.solAmount} SOL
          </span>
        </div>
      )}

      {/* Bet form — shown when in betting phase and no pending bet */}
      {!cashoutResult && betId === null && (
        <div className="bet-panel__form">
          <label className="bet-panel__label" htmlFor="bet-amount">
            Bet amount (SOL)
          </label>
          <div className="bet-panel__input-row">
            <input
              id="bet-amount"
              type="number"
              min="0.001"
              step="0.01"
              value={betSol}
              onChange={(e) => setBetSol(e.target.value)}
              className="bet-panel__input"
              disabled={status !== "betting" || betId !== null}
              aria-label="Bet amount in SOL"
            />
          </div>
          {/* Quick-pick amounts */}
          <div className="bet-panel__quickpick">
            {["0.01", "0.05", "0.1", "0.5"].map((v) => (
              <button
                key={v}
                className="bet-panel__quick-btn"
                onClick={() => setBetSol(v)}
                disabled={status !== "betting"}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            className={`bet-panel__action-btn ${canBet ? "bet-panel__action-btn--active" : ""}`}
            onClick={handleBet}
            disabled={!canBet}
          >
            {placing
              ? "Placing…"
              : status === "betting"
              ? "Place Bet"
              : status === "running"
              ? "Round in progress"
              : "Waiting…"}
          </button>
        </div>
      )}

      {/* In-round: show cashout button */}
      {betId !== null && status === "running" && (
        <div className="bet-panel__cashout-wrap">
          <button
            className="bet-panel__cashout-btn"
            onClick={handleCashout}
            disabled={!canCashout}
          >
            {cashingOut ? "Cashing out…" : `Cash Out @ ${liveMult}x`}
          </button>
          <p className="bet-panel__cashout-note">
            You&apos;re in this round. Cash out before the crash!
          </p>
        </div>
      )}

      {/* Bet placed, waiting for round to start */}
      {betId !== null && status === "betting" && (
        <div className="bet-panel__pending">
          Bet placed — waiting for round to start…
        </div>
      )}

      {/* Error */}
      {error && <p className="bet-panel__error" role="alert">{error}</p>}
    </div>
  );
}
