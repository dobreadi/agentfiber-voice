import { describe, expect, it } from "vitest";
import { createVoiceNormalizer, defaultVoiceNormalizer } from "./normalization";

describe("voice normalization", () => {
  it("normalizes Unicode words, apostrophes, punctuation, and case", () => {
    expect(defaultVoiceNormalizer.tokenize("  What's ÉLÉONORE'S pick?!  ")).toEqual({
      lower: ["whats", "éléonores", "pick"],
      original: ["Whats", "ÉLÉONORES", "pick"],
    });
    expect(defaultVoiceNormalizer.normalize("The Crown!")).toBe("the crown");
  });

  it("ships no product vocabulary in the default normalizer", () => {
    expect(defaultVoiceNormalizer.tokenize("watch list").lower).toEqual(["watch", "list"]);
  });

  it("applies caller-owned ASR token merges deterministically", () => {
    const normalizer = createVoiceNormalizer({
      tokenMerges: [["watch", "list", "watchlist"]],
    });
    expect(normalizer.tokenize("Watch List")).toEqual({
      lower: ["watchlist"],
      original: ["WatchList"],
    });
    expect(normalizer.normalize("watch list")).toBe("watchlist");
  });
});
