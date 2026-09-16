import { describe, expect, it } from "vitest";
import { createEnglishVoiceMatcher, matchEnglishVoice } from "./matcher";

describe("English base voice grammar", () => {
  it("matches conservative UI defaults and returns unmatched explicitly", () => {
    expect(matchEnglishVoice("please go back")).toEqual({ kind: "back" });
    expect(matchEnglishVoice("cancel please")).toEqual({ kind: "dismiss" });
    expect(matchEnglishVoice("press it")).toEqual({ kind: "activate" });
    expect(matchEnglishVoice("what can I say?")).toEqual({ kind: "help" });
    expect(matchEnglishVoice("open the kitchen blinds")).toEqual({
      kind: "unmatched",
      transcript: "open the kitchen blinds",
      normalized: "open the kitchen blinds",
    });
  });

  it("matches directional commands after repeated caller and polite prefixes", () => {
    const match = createEnglishVoiceMatcher({
      wakePhrases: ["atlas", "hey atlas", "hey atlas assistant"],
    });
    expect(match("Hey Atlas Assistant, could you please scroll right please?")).toEqual({
      kind: "move",
      direction: "right",
      steps: 3,
    });
  });
});

describe("English grammar extensions", () => {
  it("adds product phrases and a caller-owned fallback without granting execution authority", () => {
    type ProductIntent = { kind: "open-settings" } | { kind: "ask"; question: string };
    const match = createEnglishVoiceMatcher<ProductIntent>({
      wakePhrases: ["atlas"],
      extensionPhrases: [["open settings", { kind: "open-settings" }]],
      fallback: ({ transcript }) => ({ kind: "ask", question: transcript }),
    });

    expect(match("Atlas open settings")).toEqual({ kind: "open-settings" });
    expect(match("find something calm")).toEqual({
      kind: "ask",
      question: "find something calm",
    });
  });

  it("copies extension intents on the cold path", () => {
    const intent: { kind: "custom"; value: number } = { kind: "custom", value: 1 };
    const match = createEnglishVoiceMatcher({ extensionPhrases: [["custom action", intent]] });
    intent.value = 2;
    expect(match("custom action")).toEqual({ kind: "custom", value: 1 });
  });

  it("fails normalized duplicate and built-in collisions closed", () => {
    expect(() =>
      createEnglishVoiceMatcher({ extensionPhrases: [["Go Back!", { kind: "other" }]] }),
    ).toThrow('collides with built-in phrase: "go back"');
    expect(() =>
      createEnglishVoiceMatcher({
        extensionPhrases: [
          ["custom action", { kind: "one" }],
          ["Custom Action!", { kind: "two" }],
        ],
      }),
    ).toThrow('claims phrase twice: "custom action"');
    expect(() =>
      createEnglishVoiceMatcher({ extensionPhrases: [["left", { kind: "other" }]] }),
    ).toThrow('collides with directional command: "left"');
  });

  it("compiles defaults, prefixes, and collision checks through caller token merges", () => {
    const tokenMerges = [["go", "back", "goback"]] as const;
    const match = createEnglishVoiceMatcher({ tokenMerges });
    expect(match("go back")).toEqual({ kind: "back" });
    expect(() =>
      createEnglishVoiceMatcher({
        tokenMerges,
        extensionPhrases: [["goback", { kind: "other" }]],
      }),
    ).toThrow('collides with built-in phrase: "goback"');

    const politeMatch = createEnglishVoiceMatcher({
      tokenMerges: [["could", "you", "couldyou"]],
    });
    expect(politeMatch("could you go back")).toEqual({ kind: "back" });
    expect(() => createEnglishVoiceMatcher({ tokenMerges: [["go", "back", "left"]] })).toThrow(
      'collides base and directional phrases at: "left"',
    );
  });
});
