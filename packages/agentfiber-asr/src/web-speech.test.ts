import { describe, expect, it } from "vitest";
import {
  type WebSpeechErrorEventLike,
  type WebSpeechRecognitionLike,
  type WebSpeechResultEventLike,
  createWebSpeechTranscriptSource,
  supportsWebSpeechRecognition,
} from "./web-speech.js";

class FakeRecognition implements WebSpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: WebSpeechResultEventLike) => void) | null = null;
  onerror: ((event: WebSpeechErrorEventLike) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }

  abort(): void {
    this.aborted = true;
  }

  result(text: string, final: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: {
        0: { 0: { transcript: text }, isFinal: final, length: 1 },
        length: 1,
      },
    });
  }
}

describe("Web Speech transcript source", () => {
  it("does not claim ambient support in node", () => {
    expect(supportsWebSpeechRecognition()).toBe(false);
  });

  it("reports interim text but resolves only a final transcript", async () => {
    const recognition = new FakeRecognition();
    const interim: string[] = [];
    const source = createWebSpeechTranscriptSource({
      createRecognition: () => recognition,
      interimResults: true,
    });
    const pending = source.start({
      locale: "en-GB",
      signal: new AbortController().signal,
      onInterim: (value) => interim.push(value.text),
    });
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe("en-GB");
    recognition.result("go", false);
    recognition.result("go home", true);
    recognition.onend?.();
    expect(interim).toEqual(["go"]);
    await expect(pending).resolves.toEqual({
      status: "completed",
      transcript: { text: "go home", final: true, locale: "en-GB" },
    });
  });

  it("maps permission errors and empty final results", async () => {
    const denied = new FakeRecognition();
    const deniedSource = createWebSpeechTranscriptSource({ createRecognition: () => denied });
    const deniedResult = deniedSource.start({ signal: new AbortController().signal });
    denied.onerror?.({ error: "not-allowed" });
    await expect(deniedResult).resolves.toMatchObject({
      status: "rejected",
      error: { code: "permission-denied" },
    });

    const empty = new FakeRecognition();
    const emptySource = createWebSpeechTranscriptSource({ createRecognition: () => empty });
    const emptyResult = emptySource.start({ signal: new AbortController().signal });
    empty.onend?.();
    await expect(emptyResult).resolves.toMatchObject({
      status: "rejected",
      error: { code: "empty-transcript" },
    });
  });

  it("cancels on AbortSignal and disposes an active recognizer", async () => {
    const aborted = new FakeRecognition();
    const source = createWebSpeechTranscriptSource({ createRecognition: () => aborted });
    const controller = new AbortController();
    const result = source.start({ signal: controller.signal });
    controller.abort();
    expect(aborted.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({ status: "cancelled" });

    const active = new FakeRecognition();
    const disposable = createWebSpeechTranscriptSource({ createRecognition: () => active });
    const pending = disposable.start({ signal: new AbortController().signal });
    disposable.dispose("route teardown");
    expect(active.aborted).toBe(true);
    expect(disposable.lifecycle).toBe("disposed");
    await expect(pending).resolves.toEqual({ status: "cancelled", reason: "route teardown" });
  });
});
