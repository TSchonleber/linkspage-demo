/**
 * Types and API client for the crash game backend.
 * All endpoints are under /api/crash/* as exposed by the FastAPI backend.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoundStatus = "betting" | "running" | "crashed";

export interface CrashBet {
  bet_id: number;
  player_pubkey: string;
  bet_lamports: number;
  cashout_multiplier_x100: number | null;
  payout_lamports: number | null;
}

export interface CrashRound {
  round_id: number;
  status: RoundStatus;
  betting_ends_ms: number;
  running_starts_ms: number;
  server_time_ms: number;
  /** Only present when status === "crashed" */
  crash_at_ms?: number;
  /** Only present when status === "crashed" */
  revealed_seed?: string;
  bets: CrashBet[];
  your_bet?: CrashBet;
}

export interface CrashHistoryEntry {
  round_id: number;
  crash_multiplier_x100: number;
  ended_at_ms: number;
}

// ─── Multiplier computation ───────────────────────────────────────────────────

/**
 * Compute the current live multiplier from the running start time.
 * Matches the formula used server-side: e^(t/6) where t is seconds elapsed.
 * Clamped to a minimum of 1.00.
 */
export function computeMultiplier(runningStartsMs: number, now: number): number {
  const t = (now - runningStartsMs) / 1000;
  const mult = Math.exp(t / 6);
  return Math.max(1.0, mult);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path}: HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<TBody, TResult>(path: string, body: TBody): Promise<TResult> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json() as { detail?: string };
      if (err.detail) detail = ` — ${err.detail}`;
    } catch {
      // ignore
    }
    throw new Error(`POST ${path}: HTTP ${res.status}${detail}`);
  }
  return res.json() as Promise<TResult>;
}

// ─── Public API functions ─────────────────────────────────────────────────────

export function fetchCurrentRound(): Promise<CrashRound> {
  return apiGet<CrashRound>("/api/crash/current");
}

export function placeBet(params: {
  round_id: number;
  player_pubkey: string;
  bet_lamports: number;
}): Promise<{ bet_id: number }> {
  return apiPost<typeof params, { bet_id: number }>("/api/crash/bet", params);
}

export function cashOut(params: {
  bet_id: number;
  player_pubkey: string;
}): Promise<{ cashout_multiplier_x100: number; payout_lamports: number }> {
  return apiPost<
    typeof params,
    { cashout_multiplier_x100: number; payout_lamports: number }
  >("/api/crash/cashout", params);
}

export function fetchHistory(): Promise<CrashHistoryEntry[]> {
  return apiGet<CrashHistoryEntry[]>("/api/crash/history");
}
