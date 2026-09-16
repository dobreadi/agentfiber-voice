/** A two-token normalization rule supplied by a product or locale adapter. */
export type VoiceTokenMerge = readonly [previous: string, current: string, replacement: string];

export interface VoiceNormalizationOptions {
  /**
   * Exact lowercase token pairs to merge while tokenizing. AgentFiber ships
   * no product vocabulary; adapters opt in to their own ASR spelling fixes.
   */
  readonly tokenMerges?: readonly VoiceTokenMerge[];
}

export interface TokenizedVoiceUtterance {
  /** Lowercase tokens used for deterministic matching. */
  readonly lower: string[];
  /** Case-preserved tokens used to reconstruct captured values. */
  readonly original: string[];
}

export interface VoiceNormalizer {
  tokenize(transcript: string): TokenizedVoiceUtterance;
  normalize(text: string): string;
}

const NO_MERGES: readonly VoiceTokenMerge[] = Object.freeze([]);

/**
 * Build a stateless normalizer. Configuration is copied once so callers
 * cannot mutate matching behavior after construction.
 */
export function createVoiceNormalizer(options: VoiceNormalizationOptions = {}): VoiceNormalizer {
  const merges = (options.tokenMerges ?? NO_MERGES).map(
    ([previous, current, replacement]) =>
      [previous.toLowerCase(), current.toLowerCase(), replacement.toLowerCase()] as const,
  );

  function tokenize(transcript: string): TokenizedVoiceUtterance {
    const rawWords = transcript.split(/\s+/);
    const lower: string[] = [];
    const original: string[] = [];

    for (const raw of rawWords) {
      const cleaned = raw.replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
      if (cleaned.length === 0) continue;

      const current = cleaned.toLowerCase();
      const previousIndex = lower.length - 1;
      let merged = false;
      for (let i = 0; i < merges.length; i++) {
        const rule = merges[i];
        if (rule && lower[previousIndex] === rule[0] && current === rule[1]) {
          lower[previousIndex] = rule[2];
          original[previousIndex] = `${original[previousIndex]}${cleaned}`;
          merged = true;
          break;
        }
      }
      if (merged) continue;

      lower.push(current);
      original.push(cleaned);
    }

    return { lower, original };
  }

  return Object.freeze({
    tokenize,
    normalize(text: string): string {
      return tokenize(text).lower.join(" ");
    },
  });
}

/** Product-neutral default: punctuation/case normalization and no token merges. */
export const defaultVoiceNormalizer: VoiceNormalizer = createVoiceNormalizer();
