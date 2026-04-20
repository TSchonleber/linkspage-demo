"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  type CrashRound,
  type RoundStatus,
  computeMultiplier,
  fetchCurrentRound,
} from "@/lib/crash";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoundState {
  status: RoundStatus;
  runningStartsMs: number;
  bettingEndsMs: number;
  serverTimeMs: number;
  crashAtMs?: number;
  clockSkewMs: number;
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

const GRID_COLOR = "rgba(255,255,255,0.06)";
const CURVE_GREEN = "#10b981";
const CURVE_RED = "#ef4444";
const LABEL_COLOR = "rgba(255,255,255,0.55)";

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  const cols = 8;
  const rows = 5;
  for (let i = 0; i <= cols; i++) {
    const x = (i / cols) * cssW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = (j / rows) * cssH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  runningStartsMs: number,
  endMs: number,
  color: string,
  dpr: number
): void {
  const totalDuration = endMs - runningStartsMs;
  const steps = Math.max(60, Math.floor(totalDuration / 16));
  const finalMult = computeMultiplier(runningStartsMs, endMs);
  const maxMult = Math.max(finalMult * 1.1, 1.5);

  // Padding for Y-axis labels
  const padLeft = 52 * dpr;
  const padBottom = 28 * dpr;
  const padTop = 20 * dpr;
  const plotW = cssW * dpr - padLeft - 16 * dpr;
  const plotH = cssH * dpr - padBottom - padTop;

  function toX(t: number): number {
    return padLeft + (t / totalDuration) * plotW;
  }
  function toY(m: number): number {
    const norm = Math.log(m) / Math.log(maxMult);
    return padTop + (1 - norm) * plotH;
  }

  // Draw Y-axis labels
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = `${12 * dpr}px monospace`;
  ctx.textAlign = "right";
  const yTicks = [1.0, 2.0, 5.0, 10.0, maxMult].filter((v) => v <= maxMult * 1.05);
  for (const tick of yTicks) {
    const y = toY(tick);
    if (y >= padTop && y <= padTop + plotH) {
      ctx.fillText(`${tick.toFixed(1)}x`, padLeft - 6 * dpr, y + 4 * dpr);
    }
  }

  // Draw curve
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * dpr;
  ctx.lineJoin = "round";
  ctx.beginPath();

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * totalDuration;
    const now = runningStartsMs + t;
    const m = computeMultiplier(runningStartsMs, now);
    const x = toX(t);
    const y = toY(m);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Fill area under curve
  ctx.fillStyle =
    color === CURVE_GREEN
      ? "rgba(16,185,129,0.08)"
      : "rgba(239,68,68,0.08)";
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * totalDuration;
    const now = runningStartsMs + t;
    const m = computeMultiplier(runningStartsMs, now);
    const x = toX(t);
    const y = toY(m);
    if (i === 0) ctx.moveTo(x, padTop + plotH);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(toX(totalDuration), padTop + plotH);
  ctx.closePath();
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrashChart({
  onRoundUpdate,
}: {
  onRoundUpdate?: (round: CrashRound) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roundRef = useRef<RoundState | null>(null);
  const rafRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayStatus, setDisplayStatus] = useState<RoundStatus | null>(null);
  const [displayMult, setDisplayMult] = useState("1.00");
  const [countdown, setCountdown] = useState(0);

  const applyRound = useCallback(
    (round: CrashRound) => {
      const clockSkewMs = round.server_time_ms - Date.now();
      roundRef.current = {
        status: round.status,
        runningStartsMs: round.running_starts_ms,
        bettingEndsMs: round.betting_ends_ms,
        serverTimeMs: round.server_time_ms,
        clockSkewMs,
        crashAtMs: round.crash_at_ms,
      };
      setDisplayStatus(round.status);
      onRoundUpdate?.(round);
    },
    [onRoundUpdate]
  );

  // Poll current round every 500ms
  const poll = useCallback(() => {
    fetchCurrentRound()
      .then(applyRound)
      .catch(() => {
        // Silently retry; don't crash the animation loop
      })
      .finally(() => {
        pollTimerRef.current = setTimeout(poll, 500);
      });
  }, [applyRound]);

  useEffect(() => {
    poll();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [poll]);

  // rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;

      // Resize canvas for HiDPI
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale to CSS pixels for grid (grid should not scale with dpr)
      ctx.save();
      ctx.scale(dpr, dpr);
      drawGrid(ctx, cssW, cssH);
      ctx.restore();

      const rs = roundRef.current;

      if (!rs) {
        // Loading
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = `${16 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText("Connecting...", canvas.width / 2, canvas.height / 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now() + rs.clockSkewMs;

      if (rs.status === "betting") {
        const msLeft = Math.max(0, rs.bettingEndsMs - now);
        const secsLeft = Math.ceil(msLeft / 1000);
        setCountdown(secsLeft);

        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `bold ${22 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(
          `Place your bet — starting in ${secsLeft}s`,
          canvas.width / 2,
          canvas.height / 2
        );
        ctx.font = `${13 * dpr}px monospace`;
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillText("Round #{id} • Waiting for bets", canvas.width / 2, canvas.height / 2 + 28 * dpr);
      } else if (rs.status === "running") {
        const mult = computeMultiplier(rs.runningStartsMs, now);
        setDisplayMult(mult.toFixed(2));

        drawCurve(ctx, cssW, cssH, rs.runningStartsMs, now, CURVE_GREEN, dpr);

        // Live multiplier overlay
        ctx.fillStyle = "#10b981";
        ctx.font = `bold ${40 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`${mult.toFixed(2)}x`, canvas.width / 2, 72 * dpr);
      } else if (rs.status === "crashed") {
        const endMs = rs.crashAtMs ?? now;
        const finalMult = computeMultiplier(rs.runningStartsMs, endMs);

        drawCurve(ctx, cssW, cssH, rs.runningStartsMs, endMs, CURVE_RED, dpr);

        // CRASHED overlay
        ctx.fillStyle = CURVE_RED;
        ctx.font = `bold ${36 * dpr}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`CRASHED @ ${finalMult.toFixed(2)}x`, canvas.width / 2, 72 * dpr);
        setDisplayMult(finalMult.toFixed(2));
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="crash-chart-wrap">
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          borderRadius: "12px",
        }}
      />
      {/* Accessible status for screen readers */}
      <span className="sr-only">
        {displayStatus === "betting"
          ? `Betting phase, ${countdown}s remaining`
          : displayStatus === "running"
          ? `Running at ${displayMult}x`
          : displayStatus === "crashed"
          ? `Crashed at ${displayMult}x`
          : "Loading"}
      </span>
    </div>
  );
}
