import { defaultVoiceNormalizer } from "@agentfiber/voice";

export type EnglishVoiceDirection = "up" | "down" | "left" | "right";

export interface EnglishDirectionalCommand {
  readonly direction: EnglishVoiceDirection;
  readonly steps: number;
}

/**
 * Anchored English directional grammar. Exported for collision validators and profilers.
 * It has no stateful flags, so repeated `exec` calls are deterministic. Counts may be digits,
 * the words one..ten, or the repeat adverbs once/twice/thrice ("down twice").
 */
export const ENGLISH_DIRECTIONAL_PATTERN =
  /^(?:(go|move|scroll|step|navigate|page) )?(?:(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|once|twice|thrice) )?(?:(?:times|rows?|rails?|tiles?|items?|steps?|pages?) )?(up|down|left|right)(?: (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|once|twice|thrice))?(?: (?:times|rows?|rails?|tiles?|items?|steps?|pages?))?$/;

const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
});

const REPEAT_ADVERBS: Readonly<Record<string, number>> = Object.freeze({
  once: 1,
  twice: 2,
  thrice: 3,
});

export const ENGLISH_DIRECTIONAL_MAX_STEPS = 10;

function strideDefault(verb: string | undefined, direction: EnglishVoiceDirection): number {
  const vertical = direction === "up" || direction === "down";
  if (verb === "scroll") return vertical ? 2 : 3;
  if (verb === "page") return vertical ? 2 : 6;
  return 1;
}

function parseSteps(word: string | undefined, fallback: number): number {
  if (!word) return fallback;
  const n = NUMBER_WORDS[word] ?? REPEAT_ADVERBS[word] ?? Number.parseInt(word, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, ENGLISH_DIRECTIONAL_MAX_STEPS);
}

/** Parse an already normalized English phrase key without another tokenization pass. */
export function parseEnglishDirectionalKey(key: string): EnglishDirectionalCommand | null {
  const match = ENGLISH_DIRECTIONAL_PATTERN.exec(key);
  if (!match) return null;

  const direction = match[3] as EnglishVoiceDirection;
  return Object.freeze({
    direction,
    steps: parseSteps(match[2] ?? match[4], strideDefault(match[1], direction)),
  });
}

/** Parse one raw English movement utterance. */
export function parseEnglishDirectionalCommand(
  transcript: string,
): EnglishDirectionalCommand | null {
  return parseEnglishDirectionalKey(defaultVoiceNormalizer.normalize(transcript));
}
