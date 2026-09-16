import { describe, expect, it, vi } from "vitest";
import { createHttpAsrTranscriber, createOpenAiCompatibleWhisperTranscriber } from "./http.js";

function request(signal: AbortSignal, bytes = new Uint8Array([1, 2, 3])) {
  return {
    requestId: "request-1",
    audio: { bytes, contentType: "audio/wav", fileName: "sample.wav" },
    locale: "en-GB",
    signal,
  } as const;
}

describe("HTTP ASR transcriber", () => {
  it("posts raw audio and returns a final transcript", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "audio/wav" });
      return new Response(JSON.stringify({ text: "  go home  " }), { status: 200 });
    });
    const transcriber = createHttpAsrTranscriber({ endpoint: "/asr", fetch: fetcher });
    await expect(transcriber.transcribe(request(new AbortController().signal))).resolves.toEqual({
      status: "completed",
      transcript: { text: "go home", final: true, locale: "en-GB" },
    });
  });

  it("supports custom request encoders and parsers", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.body).toBe("encoded");
      expect(init?.headers).toEqual({ Authorization: "short-lived", "X-Audio": "custom" });
      return new Response("heard", { status: 200 });
    });
    const transcriber = createHttpAsrTranscriber({
      endpoint: (value) => `/asr/${value.requestId}`,
      fetch: fetcher,
      headers: () => ({ Authorization: "short-lived" }),
      encodeRequest: () => ({ body: "encoded", headers: { "X-Audio": "custom" } }),
      parseResponse: async (response) => ({ text: await response.text(), final: true }),
    });
    const result = await transcriber.transcribe(request(new AbortController().signal));
    expect(result).toEqual({
      status: "completed",
      transcript: { text: "heard", final: true },
    });
  });

  it("rejects empty audio and malformed or empty responses", async () => {
    const transcriber = createHttpAsrTranscriber({
      endpoint: "/asr",
      fetch: async () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
    });
    expect(
      await transcriber.transcribe(request(new AbortController().signal, new Uint8Array())),
    ).toMatchObject({
      status: "rejected",
      error: { code: "empty-audio" },
    });
    expect(await transcriber.transcribe(request(new AbortController().signal))).toMatchObject({
      status: "rejected",
      error: { code: "malformed-response" },
    });
  });

  it("classifies provider rejection, caller cancellation, timeout, and disposal", async () => {
    const rejected = createHttpAsrTranscriber({
      endpoint: "/asr",
      fetch: async () => new Response("busy", { status: 503 }),
    });
    expect(await rejected.transcribe(request(new AbortController().signal))).toMatchObject({
      status: "rejected",
      error: { code: "provider-rejected", status: 503, retryable: true },
    });

    const cancelledController = new AbortController();
    cancelledController.abort();
    expect(await rejected.transcribe(request(cancelledController.signal))).toMatchObject({
      status: "cancelled",
    });

    const never = createHttpAsrTranscriber({
      endpoint: "/asr",
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    expect(await never.transcribe(request(new AbortController().signal))).toMatchObject({
      status: "rejected",
      error: { code: "timeout" },
    });

    rejected.dispose();
    expect(rejected.lifecycle).toBe("disposed");
    expect(await rejected.transcribe(request(new AbortController().signal))).toMatchObject({
      status: "rejected",
      error: { code: "disposed" },
    });
  });

  it("encodes OpenAI-compatible multipart without fixing the endpoint or provider", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input).toBe("https://speech.example/v1/audio/transcriptions");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("local-whisper");
      expect(form.get("language")).toBe("en-GB");
      expect((form.get("file") as File).name).toBe("sample.wav");
      return new Response(JSON.stringify({ text: "hello" }), { status: 200 });
    });
    const transcriber = createOpenAiCompatibleWhisperTranscriber({
      endpoint: "https://speech.example/v1/audio/transcriptions",
      fetch: fetcher,
      model: "local-whisper",
    });
    expect(await transcriber.transcribe(request(new AbortController().signal))).toMatchObject({
      status: "completed",
      transcript: { text: "hello" },
    });
  });
});
