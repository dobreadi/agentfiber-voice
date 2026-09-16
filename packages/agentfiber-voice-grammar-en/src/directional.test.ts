import { describe, expect, it } from "vitest";
import {
  ENGLISH_DIRECTIONAL_MAX_STEPS,
  parseEnglishDirectionalCommand,
  parseEnglishDirectionalKey,
} from "./directional";

describe("parseEnglishDirectionalCommand", () => {
  it("parses raw punctuation, directions, and explicit counts", () => {
    expect(parseEnglishDirectionalCommand("Move three tiles LEFT!")).toEqual({
      direction: "left",
      steps: 3,
    });
    expect(parseEnglishDirectionalCommand("down 4 rows")).toEqual({
      direction: "down",
      steps: 4,
    });
  });

  it("retains the proven scroll and page stride semantics", () => {
    expect(parseEnglishDirectionalCommand("scroll right")).toEqual({
      direction: "right",
      steps: 3,
    });
    expect(parseEnglishDirectionalCommand("scroll down")).toEqual({
      direction: "down",
      steps: 2,
    });
    expect(parseEnglishDirectionalCommand("page left")).toEqual({
      direction: "left",
      steps: 6,
    });
    expect(parseEnglishDirectionalCommand("page up")).toEqual({ direction: "up", steps: 2 });
  });

  it("parses the repeat adverbs once, twice, and thrice", () => {
    expect(parseEnglishDirectionalCommand("Down twice.")).toEqual({
      direction: "down",
      steps: 2,
    });
    expect(parseEnglishDirectionalCommand("go up once")).toEqual({ direction: "up", steps: 1 });
    expect(parseEnglishDirectionalCommand("twice left")).toEqual({
      direction: "left",
      steps: 2,
    });
    expect(parseEnglishDirectionalCommand("right thrice")).toEqual({
      direction: "right",
      steps: 3,
    });
    expect(parseEnglishDirectionalCommand("scroll down twice")).toEqual({
      direction: "down",
      steps: 2,
    });
  });

  it("caps counts and rejects non-directional utterances", () => {
    expect(parseEnglishDirectionalCommand("right 99")).toEqual({
      direction: "right",
      steps: ENGLISH_DIRECTIONAL_MAX_STEPS,
    });
    expect(parseEnglishDirectionalCommand("open settings")).toBeNull();
  });

  it("accepts an already normalized key without changing semantics", () => {
    expect(parseEnglishDirectionalKey("move three tiles left")).toEqual({
      direction: "left",
      steps: 3,
    });
  });
});
