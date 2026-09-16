export interface VoiceIntentLike {
  readonly kind: string;
}

/** A pure synchronous matcher. Products define their own intent and context vocabularies. */
export type DeterministicVoiceMatcher<Intent extends VoiceIntentLike, Context> = (
  transcript: string,
  context: Context,
) => Intent;

export interface VoiceTierClaim<Intent extends VoiceIntentLike> {
  readonly intent: Intent;
  readonly note?: string;
}

/** One tier in a caller-authored, first-claim-wins grammar. */
export interface VoiceMatchTier<
  Intent extends VoiceIntentLike,
  State,
  TierId extends string = string,
> {
  readonly tier: TierId;
  readonly claim: (state: State) => VoiceTierClaim<Intent> | null;
  readonly explain?: (state: State) => string | undefined;
}

export type VoiceMatchTierVisitor<
  Intent extends VoiceIntentLike,
  TierId extends string = string,
> = (tier: TierId, intent: Intent | null, note?: string) => void;

/**
 * Walk an ordered grammar once.
 *
 * Without a visitor this returns immediately on the first claim. With a
 * visitor it continues through every tier for diagnostics while retaining
 * the first claim as the winner. A required fallback makes the result total
 * even when no tier claims.
 *
 * Tier callbacks are part of the caller's deterministic grammar contract:
 * they must be pure, synchronous, and non-throwing. The walker does not hide
 * a broken tier by catching programmer errors.
 */
export function walkVoiceMatchTiers<Intent extends VoiceIntentLike, State, TierId extends string>(
  tiers: readonly VoiceMatchTier<Intent, State, TierId>[],
  state: State,
  fallback: (state: State) => Intent,
  visit?: VoiceMatchTierVisitor<Intent, TierId>,
): Intent {
  let winner: Intent | null = null;
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    if (!tier) continue;
    const hit = tier.claim(state);
    if (visit === undefined) {
      if (hit) return hit.intent;
      continue;
    }
    visit(tier.tier, hit?.intent ?? null, hit?.note ?? tier.explain?.(state));
    if (hit && winner === null) winner = hit.intent;
  }
  return winner ?? fallback(state);
}
