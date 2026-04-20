import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Crashgame } from "../../target/types/crashgame";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert, expect } from "chai";
import { createHash } from "crypto";

// sha256 helper returning a 32-byte Buffer.
const sha256 = (buf: Buffer | Uint8Array): Buffer =>
  createHash("sha256").update(buf).digest();

describe("crashgame", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Crashgame as Program<Crashgame>;

  const authority = provider.wallet;
  const user = Keypair.generate();

  // Build a short hash chain of 4 seeds so we can commit rounds 1..3 and
  // still have seed[0] as the terminal pre-image.
  //   seed_raw[3] = random
  //   seed[i]     = sha256(seed[i+1])
  // terminal_hash = sha256(seed[0])
  const rawSeeds: Buffer[] = [];
  const chainLen = 4;
  for (let i = 0; i < chainLen; i++) {
    rawSeeds.push(Buffer.from(anchor.utils.bytes.utf8.encode("seed-" + i).slice(0, 32).padEnd(32, "\0")));
  }
  // Override so it's actually a chain: seed[i] = sha256(seed[i+1]).
  const seeds: Buffer[] = new Array(chainLen);
  seeds[chainLen - 1] = sha256(Buffer.from("root-entropy-for-crashgame-test"));
  for (let i = chainLen - 2; i >= 0; i--) {
    seeds[i] = sha256(seeds[i + 1]);
  }
  const terminalHash = sha256(seeds[0]);
  // Reveal order for rounds 1, 2, 3 is seeds[0], seeds[1], seeds[2].
  // committed_hash for round k (1-indexed) = sha256(seeds[k-1]) which is
  // terminalHash for k=1, seeds[k-2] for k>=2. Wait: we need committed_hash
  // for round k to hash back to the *previous* committed hash. Simpler
  // scheme used here: committed_hash_k = sha256(revealed_seed_k). So for
  // round 1 revealed = seeds[0] and committed_hash = terminalHash.
  const roundsPlan = [
    { roundId: 1, revealed: seeds[0], committedHash: terminalHash },
    { roundId: 2, revealed: seeds[1], committedHash: seeds[0] },
  ];

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId,
  );
  const [userBalancePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), user.publicKey.toBuffer()],
    program.programId,
  );
  const roundPda = (roundId: number): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("round"), new BN(roundId).toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  before(async () => {
    // Airdrop to user.
    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      5 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  });

  it("initialize: stores terminal hash + authority, creates config PDA", async () => {
    await program.methods
      .initialize(Array.from(terminalHash) as any)
      .accountsStrict({
        config: configPda,
        vault: vaultPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.authority.toBase58()).to.eq(authority.publicKey.toBase58());
    expect(Buffer.from(cfg.terminalHash)).to.deep.eq(terminalHash);
    expect(cfg.lastCommittedRound.toNumber()).to.eq(0);
  });

  it("deposit: transfers SOL into vault, credits ledger entry", async () => {
    // Fund the vault first with a small rent-reserve so SOL transfers work
    // regardless of whether SystemAccount PDAs need pre-funding. Anchor
    // system_program::transfer handles creation of recipient implicitly
    // for SystemAccount if it has lamports=0, but the PDA is empty on-chain
    // until first transfer in -- the deposit IS that first transfer.
    const depositAmount = new BN(LAMPORTS_PER_SOL); // 1 SOL
    await program.methods
      .deposit(depositAmount)
      .accountsStrict({
        config: configPda,
        vault: vaultPda,
        userBalance: userBalancePda,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const bal = await program.account.userBalance.fetch(userBalancePda);
    expect(bal.lamports.toString()).to.eq(depositAmount.toString());
    expect(bal.owner.toBase58()).to.eq(user.publicKey.toBase58());

    const vaultLamports = await provider.connection.getBalance(vaultPda);
    expect(vaultLamports).to.be.gte(depositAmount.toNumber());
  });

  it("withdraw: decrements ledger and transfers SOL back", async () => {
    const withdrawAmount = new BN(0.25 * LAMPORTS_PER_SOL);
    const preUser = await provider.connection.getBalance(user.publicKey);

    await program.methods
      .withdraw(withdrawAmount)
      .accountsStrict({
        config: configPda,
        vault: vaultPda,
        userBalance: userBalancePda,
        owner: user.publicKey,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const bal = await program.account.userBalance.fetch(userBalancePda);
    expect(bal.lamports.toString()).to.eq(
      new BN(LAMPORTS_PER_SOL).sub(withdrawAmount).toString(),
    );
    const postUser = await provider.connection.getBalance(user.publicKey);
    // Rough check: user balance went up by ~withdrawAmount minus tx fee.
    expect(postUser).to.be.greaterThan(preUser);
  });

  it("commit_round: authority registers committed hash for round 1", async () => {
    const plan = roundsPlan[0];
    await program.methods
      .commitRound(new BN(plan.roundId), Array.from(plan.committedHash) as any)
      .accountsStrict({
        config: configPda,
        round: roundPda(plan.roundId),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const round = await program.account.round.fetch(roundPda(plan.roundId));
    expect(round.roundId.toNumber()).to.eq(plan.roundId);
    expect(Buffer.from(round.committedHash)).to.deep.eq(plan.committedHash);
    expect(round.settled).to.eq(false);
  });

  it("settle_round: happy path — verifies seed, marks settled, pays winner", async () => {
    const plan = roundsPlan[0];
    const payoutAmount = new BN(0.1 * LAMPORTS_PER_SOL);
    const preUser = await provider.connection.getBalance(user.publicKey);

    await program.methods
      .settleRound(
        new BN(plan.roundId),
        Array.from(plan.revealed) as any,
        [
          {
            user: user.publicKey,
            amount: payoutAmount,
          },
        ],
      )
      .accountsStrict({
        config: configPda,
        vault: vaultPda,
        round: roundPda(plan.roundId),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: user.publicKey, isSigner: false, isWritable: true },
      ])
      .rpc();

    const round = await program.account.round.fetch(roundPda(plan.roundId));
    expect(round.settled).to.eq(true);
    expect(Buffer.from(round.revealedSeed)).to.deep.eq(plan.revealed);
    expect(round.crashMultiplierBps.toNumber()).to.be.gte(10_000);

    const postUser = await provider.connection.getBalance(user.publicKey);
    expect(postUser - preUser).to.eq(payoutAmount.toNumber());
  });

  it("settle_round: fails on hash mismatch (wrong revealed seed)", async () => {
    const plan = roundsPlan[1];
    // Commit round 2 legitimately.
    await program.methods
      .commitRound(new BN(plan.roundId), Array.from(plan.committedHash) as any)
      .accountsStrict({
        config: configPda,
        round: roundPda(plan.roundId),
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Attempt to settle with a bogus seed that does NOT hash to committedHash.
    const badSeed = Buffer.alloc(32, 0xab);

    try {
      await program.methods
        .settleRound(new BN(plan.roundId), Array.from(badSeed) as any, [])
        .accountsStrict({
          config: configPda,
          vault: vaultPda,
          round: roundPda(plan.roundId),
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([])
        .rpc();
      assert.fail("expected hash mismatch error");
    } catch (err: any) {
      const msg = err?.error?.errorCode?.code ?? err?.toString() ?? "";
      expect(String(msg)).to.match(/HashMismatch/);
    }

    // The round should still be unsettled.
    const round = await program.account.round.fetch(roundPda(plan.roundId));
    expect(round.settled).to.eq(false);
  });
});
