import {
  type VoiceIntentLike,
  type VoiceMatchTier,
  type VoiceTokenMerge,
  createVoiceNormalizer,
  walkVoiceMatchTiers,
} from "@agentfiber/voice";
import { type EnglishDirectionalCommand, parseEnglishDirectionalKey } from "./directional.js";

export type EnglishBaseVoiceIntent =
  | { readonly kind: "back" }
  | { readonly kind: "dismiss" }
  | { readonly kind: "activate" }
  | { readonly kind: "help" }
  | {
      readonly kind: "move";
      readonly direction: EnglishDirectionalCommand["direction"];
      readonly steps: number;
    };

export interface EnglishUnmatchedVoiceIntent {
  readonly kind: "unmatched";
  readonly transcript: string;
  readonly normalized: string;
}

export type EnglishVoicePhraseEntry<Intent extends VoiceIntentLike> = readonly [
  phrase: string,
  intent: Intent,
];

export interface EnglishVoiceMatchInput {
  readonly transcript: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
  readonly originalTokens: readonly string[];
}

export interface EnglishVoiceGrammarOptions<CustomIntent extends VoiceIntentLike = never> {
  /** Product/assistant prefixes stripped repeatedly before matching. */
  readonly wakePhrases?: readonly string[];
  /** Caller-owned ASR spelling repairs, copied once by the normalizer. */
  readonly tokenMerges?: readonly VoiceTokenMerge[];
  /** Bounded exact phrases evaluated before the defaults. Built-in collisions are rejected. */
  readonly extensionPhrases?: readonly EnglishVoicePhraseEntry<CustomIntent>[];
  /** Optional product fallback. Without one, matching returns an explicit `unmatched` intent. */
  readonly fallback?: (input: EnglishVoiceMatchInput) => CustomIntent;
}

export type EnglishVoiceMatch<CustomIntent extends VoiceIntentLike = never> = (
  transcript: string,
) => EnglishBaseVoiceIntent | EnglishUnmatchedVoiceIntent | CustomIntent;

const BACK = Object.freeze({ kind: "back" } as const);
const DISMISS = Object.freeze({ kind: "dismiss" } as const);
const ACTIVATE = Object.freeze({ kind: "activate" } as const);
const HELP = Object.freeze({ kind: "help" } as const);

function entry<Intent extends VoiceIntentLike>(
  phrase: string,
  intent: Intent,
): EnglishVoicePhraseEntry<Intent> {
  return Object.freeze([phrase, intent] as const);
}

export const ENGLISH_BASE_PHRASE_ENTRIES: readonly EnglishVoicePhraseEntry<EnglishBaseVoiceIntent>[] =
  Object.freeze([
    entry("back", BACK),
    entry("go back", BACK),
    entry("close", BACK),
    entry("close this", BACK),
    entry("close it", BACK),
    entry("exit", BACK),
    entry("never mind", DISMISS),
    entry("nevermind", DISMISS),
    entry("cancel", DISMISS),
    entry("forget it", DISMISS),
    entry("ok", ACTIVATE),
    entry("okay", ACTIVATE),
    entry("press it", ACTIVATE),
    entry("press this", ACTIVATE),
    entry("press that", ACTIVATE),
    entry("press ok", ACTIVATE),
    entry("confirm", ACTIVATE),
    entry("select", ACTIVATE),
    entry("help", HELP),
    entry("voice help", HELP),
    entry("what can i say", HELP),
    entry("what can you do", HELP),
    entry("what do i say", HELP),
    entry("how does this work", HELP),
  ]);

const GENERIC_POLITE_PREFIX_PHRASES = Object.freeze([
  "please",
  "can you",
  "could you",
  "would you",
]);

function prefixLength(
  tokens: readonly string[],
  start: number,
  prefixes: readonly (readonly string[])[],
): number {
  for (const prefix of prefixes) {
    if (prefix.length > tokens.length - start) continue;
    let matches = true;
    for (let i = 0; i < prefix.length; i++) {
      if (tokens[start + i] !== prefix[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return prefix.length;
  }
  return 0;
}

/**
 * Build a deterministic English matcher. Configuration is validated and copied on this cold
 * path; utterance matching performs no I/O and owns no lifecycle resources.
 */
export function createEnglishVoiceMatcher<CustomIntent extends VoiceIntentLike = never>(
  options: EnglishVoiceGrammarOptions<CustomIntent> = {},
): EnglishVoiceMatch<CustomIntent> {
  const normalizer = createVoiceNormalizer({ tokenMerges: options.tokenMerges });
  const basePhrases = new Map<string, EnglishBaseVoiceIntent>();
  for (const [authoredPhrase, intent] of ENGLISH_BASE_PHRASE_ENTRIES) {
    const phrase = normalizer.normalize(authoredPhrase);
    if (parseEnglishDirectionalKey(phrase) !== null) {
      throw new Error(
        `English voice token merge collides base and directional phrases at: "${phrase}"`,
      );
    }
    const existing = basePhrases.get(phrase);
    if (existing !== undefined && existing.kind !== intent.kind) {
      throw new Error(`English voice token merge collides base phrases at: "${phrase}"`);
    }
    basePhrases.set(phrase, intent);
  }
  const extensionPhrases = new Map<string, CustomIntent>();

  for (const [authoredPhrase, authoredIntent] of options.extensionPhrases ?? []) {
    const phrase = normalizer.normalize(authoredPhrase);
    if (phrase.length === 0) throw new Error("English voice extension phrase is empty");
    if (basePhrases.has(phrase)) {
      throw new Error(`English voice extension collides with built-in phrase: "${phrase}"`);
    }
    if (parseEnglishDirectionalKey(phrase) !== null) {
      throw new Error(`English voice extension collides with directional command: "${phrase}"`);
    }
    if (extensionPhrases.has(phrase)) {
      throw new Error(`English voice extension claims phrase twice: "${phrase}"`);
    }
    extensionPhrases.set(phrase, Object.freeze({ ...authoredIntent }) as CustomIntent);
  }

  const wakePrefixes = (options.wakePhrases ?? []).map((phrase) => {
    const tokens = normalizer.tokenize(phrase).lower;
    if (tokens.length === 0) throw new Error("English voice wake phrase is empty");
    return Object.freeze([...tokens]);
  });
  wakePrefixes.sort((a, b) => b.length - a.length);
  const politePrefixes = GENERIC_POLITE_PREFIX_PHRASES.map((phrase) =>
    Object.freeze([...normalizer.tokenize(phrase).lower]),
  );
  const prefixes = Object.freeze([...wakePrefixes, ...politePrefixes]);
  const fallback = options.fallback;

  type MatchIntent = EnglishBaseVoiceIntent | EnglishUnmatchedVoiceIntent | CustomIntent;
  type Tier = VoiceMatchTier<MatchIntent, EnglishVoiceMatchInput, "extension" | "base" | "move">;

  const tiers: readonly Tier[] = Object.freeze([
    {
      tier: "extension",
      claim: (input) => {
        const intent = extensionPhrases.get(input.normalized);
        return intent ? { intent, note: `extension phrase "${input.normalized}"` } : null;
      },
    },
    {
      tier: "base",
      claim: (input) => {
        const intent = basePhrases.get(input.normalized);
        return intent ? { intent, note: `English base phrase "${input.normalized}"` } : null;
      },
    },
    {
      tier: "move",
      claim: (input) => {
        const movement = parseEnglishDirectionalKey(input.normalized);
        return movement
          ? {
              intent: Object.freeze({ kind: "move", ...movement }),
              note: "English directional command",
            }
          : null;
      },
    },
  ]);

  return (transcript: string): MatchIntent => {
    const { lower, original } = normalizer.tokenize(transcript);
    let start = 0;
    for (;;) {
      const length = prefixLength(lower, start, prefixes);
      if (length === 0) break;
      start += length;
    }
    let end = lower.length;
    while (end > start && lower[end - 1] === "please") end--;

    const input: EnglishVoiceMatchInput = Object.freeze({
      transcript: transcript.trim(),
      normalized: lower.slice(start, end).join(" "),
      tokens: Object.freeze(lower.slice(start, end)),
      originalTokens: Object.freeze(original.slice(start, end)),
    });

    return walkVoiceMatchTiers(tiers, input, (state) =>
      fallback
        ? fallback(state)
        : Object.freeze({
            kind: "unmatched",
            transcript: state.transcript,
            normalized: state.normalized,
          }),
    );
  };
}

/** Product-neutral singleton with no wake word, token merge, extension, or action fallback. */
export const matchEnglishVoice: EnglishVoiceMatch = createEnglishVoiceMatcher();
