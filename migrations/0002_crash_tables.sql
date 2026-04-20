-- Crash game: round lifecycle state.
-- One row per round. `status` is the authoritative phase indicator, but
-- routes derive live phase from ms timestamps so restarts/races can't
-- pin us to a stale value. `crash_multiplier_x100` is committed at round
-- birth (derived from the seed) even though we only reveal it post-crash.
CREATE TABLE IF NOT EXISTS crash_rounds (
  round_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  committed_hash  TEXT NOT NULL,
  revealed_seed   TEXT,
  crash_multiplier_x100 INTEGER,   -- e.g. 247 means 2.47x
  betting_ends_ms INTEGER NOT NULL,
  running_starts_ms INTEGER NOT NULL,
  crash_at_ms     INTEGER NOT NULL,
  status          TEXT NOT NULL,   -- "betting" | "running" | "crashed"
  created_at_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crash_rounds_status ON crash_rounds(status);

-- Individual bets. A player can only hold one active bet per round
-- (enforced at the route layer, not the DB, so we don't need a unique idx).
CREATE TABLE IF NOT EXISTS crash_bets (
  bet_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id        INTEGER NOT NULL,
  player_pubkey   TEXT NOT NULL,
  bet_lamports    INTEGER NOT NULL,
  cashed_out_at_ms INTEGER,
  cashout_multiplier_x100 INTEGER,
  payout_lamports INTEGER,
  created_at_ms   INTEGER NOT NULL,
  FOREIGN KEY (round_id) REFERENCES crash_rounds(round_id)
);
CREATE INDEX IF NOT EXISTS crash_bets_round ON crash_bets(round_id);
CREATE INDEX IF NOT EXISTS crash_bets_player ON crash_bets(player_pubkey);

-- Provably-fair seed chain. Pre-generated; seeds consumed in REVERSE
-- (highest idx first) so that revealing seed[i] lets players verify
-- sha256(seed[i]) == seed[i+1]'s committed hash.
CREATE TABLE IF NOT EXISTS crash_seed_chain (
  idx INTEGER PRIMARY KEY,
  seed_hex TEXT NOT NULL,
  consumed_by_round INTEGER
);
