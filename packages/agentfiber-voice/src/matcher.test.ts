import { describe, expect, it } from "vitest";
import { type VoiceMatchTier, type VoiceMatchTierVisitor, walkVoiceMatchTiers } from "./matcher";

type Intent = { kind: "first" | "second" | "fallback" };
type State = { key: string };
type TierId = "one" | "two";

const tiers: readonly VoiceMatchTier<Intent, State, TierId>[] = [
  {
    tier: "one",
    claim: (state) => (state.key === "hit" ? { intent: { kind: "first" }, note: "one" } : null),
  },
  {
    tier: "two",
    claim: (state) => (state.key === "hit" ? { intent: { kind: "second" }, note: "two" } : null),
    explain: () => "two missed",
  },
];

describe("walkVoiceMatchTiers", () => {
  it("returns the first claim without visiting later tiers", () => {
    let secondCalls = 0;
    const localTiers: typeof tiers = [
      tiers[0] as (typeof tiers)[number],
      {
        tier: "two",
        claim: (state) => {
          secondCalls++;
          return tiers[1]?.claim(state) ?? null;
        },
      },
    ];
    expect(
      walkVoiceMatchTiers(localTiers, { key: "hit" }, (): Intent => ({ kind: "fallback" })),
    ).toEqual({ kind: "first" });
    expect(secondCalls).toBe(0);
  });

  it("keeps the first winner while a visitor observes every tier", () => {
    const seen: Array<[TierId, Intent["kind"] | null, string | undefined]> = [];
    const visit: VoiceMatchTierVisitor<Intent, TierId> = (tier, intent, note) => {
      seen.push([tier, intent?.kind ?? null, note]);
    };
    expect(
      walkVoiceMatchTiers(tiers, { key: "hit" }, (): Intent => ({ kind: "fallback" }), visit),
    ).toEqual({ kind: "first" });
    expect(seen).toEqual([
      ["one", "first", "one"],
      ["two", "second", "two"],
    ]);
  });

  it("uses the required total fallback when no tier claims", () => {
    expect(
      walkVoiceMatchTiers(tiers, { key: "miss" }, (): Intent => ({ kind: "fallback" })),
    ).toEqual({ kind: "fallback" });
  });
});
