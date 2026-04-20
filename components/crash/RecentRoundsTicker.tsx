"use client";

import React, { useEffect, useRef, useState } from "react";
import { type CrashHistoryEntry, fetchHistory } from "@/lib/crash";

function multiplierColor(multX100: number): string {
  const m = multX100 / 100;
  if (m >= 2.0) return "#10b981"; // green
  if (m >= 1.5) return "#f59e0b"; // yellow
  return "#ef4444";               // red
}

function formatMult(multX100: number): string {
  return (multX100 / 100).toFixed(2) + "x";
}

export default function RecentRoundsTicker() {
  const [history, setHistory] = useState<CrashHistoryEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    fetchHistory()
      .then((entries) => setHistory(entries.slice(0, 20)))
      .catch(() => {
        // silently retry
      });
  };

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (history.length === 0) {
    return (
      <div className="ticker">
        <span className="ticker__loading">Loading history…</span>
      </div>
    );
  }

  return (
    <div className="ticker" role="region" aria-label="Recent rounds">
      <span className="ticker__label">Recent:</span>
      <div className="ticker__scroll">
        {history.map((entry) => (
          <span
            key={entry.round_id}
            className="ticker__pill"
            style={{ color: multiplierColor(entry.crash_multiplier_x100) }}
            title={`Round ${entry.round_id}`}
          >
            {formatMult(entry.crash_multiplier_x100)}
          </span>
        ))}
      </div>
    </div>
  );
}
