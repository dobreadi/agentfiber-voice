import {
  type AsrTranscript,
  type AsrTranscriptSource,
  type AsrTranscriptSourceOptions,
  type AsrTranscriptionResult,
  asrError,
  finalTranscript,
} from "./contracts.js";

export interface WebSpeechAlternativeLike {
  readonly transcript: string;
}

export interface WebSpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: WebSpeechAlternativeLike;
}

export interface WebSpeechResultListLike {
  readonly length: number;
  readonly [index: number]: WebSpeechResultLike;
}

export interface WebSpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: WebSpeechResultListLike;
}

export interface WebSpeechErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

export interface WebSpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: WebSpeechResultEventLike) => void) | null;
  onerror: ((event: WebSpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type WebSpeechRecognitionFactory = () => WebSpeechRecognitionLike;

export interface WebSpeechTranscriptSourceOptions {
  readonly createRecognition?: WebSpeechRecognitionFactory;
  readonly interimResults?: boolean;
  readonly continuous?: boolean;
}

type RecognitionConstructor = new () => WebSpeechRecognitionLike;

function ambientRecognitionFactory(): WebSpeechRecognitionLike {
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (Recognition === undefined) throw new Error("Web Speech recognition is unsupported");
  return new Recognition();
}

export function supportsWebSpeechRecognition(): boolean {
  const scope = globalThis as typeof globalThis & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return (
    typeof scope.SpeechRecognition === "function" ||
    typeof scope.webkitSpeechRecognition === "function"
  );
}

function webSpeechError(error: string, message?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return asrError("permission-denied", message ?? "speech recognition permission denied", false);
  }
  if (error === "aborted")
    return asrError("cancelled", message ?? "speech recognition aborted", true);
  if (error === "no-speech")
    return asrError("empty-transcript", message ?? "no speech detected", true);
  if (error === "network")
    return asrError("network", message ?? "speech recognition network error", true);
  return asrError("provider-rejected", message ?? `speech recognition failed: ${error}`, true);
}

export function createWebSpeechTranscriptSource(
  configuration: WebSpeechTranscriptSourceOptions = {},
): AsrTranscriptSource {
  const createRecognition = configuration.createRecognition ?? ambientRecognitionFactory;
  let disposed = false;
  let recognition: WebSpeechRecognitionLike | null = null;
  let settleActive: ((result: AsrTranscriptionResult) => void) | null = null;

  return {
    get lifecycle() {
      return disposed ? "disposed" : "active";
    },
    start(options: AsrTranscriptSourceOptions): Promise<AsrTranscriptionResult> {
      if (disposed) {
        return Promise.resolve({
          status: "rejected",
          error: asrError("disposed", "speech transcript source is disposed", false),
        });
      }
      if (recognition !== null) {
        return Promise.resolve({
          status: "rejected",
          error: asrError("busy", "speech transcript source is already active", true),
        });
      }
      if (options.signal.aborted) {
        return Promise.resolve({
          status: "cancelled",
          reason: "request signal was already aborted",
        });
      }

      return new Promise((resolve) => {
        let current: WebSpeechRecognitionLike;
        try {
          current = createRecognition();
        } catch {
          resolve({
            status: "rejected",
            error: asrError("unsupported", "Web Speech recognition is unsupported", false),
          });
          return;
        }
        recognition = current;
        let finalText = "";
        let settled = false;

        const cleanup = (): void => {
          options.signal.removeEventListener("abort", onAbort);
          current.onresult = null;
          current.onerror = null;
          current.onend = null;
          if (recognition === current) recognition = null;
          if (settleActive === settle) settleActive = null;
        };
        const settle = (result: AsrTranscriptionResult): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };
        settleActive = settle;
        const onAbort = (): void => {
          current.abort();
          settle({ status: "cancelled", reason: "request signal was aborted" });
        };

        current.continuous = configuration.continuous ?? false;
        current.interimResults = configuration.interimResults ?? options.onInterim !== undefined;
        current.lang = options.locale ?? "";
        current.onresult = (event) => {
          for (let i = event.resultIndex, len = event.results.length; i < len; i++) {
            const result = event.results[i];
            const alternative = result?.[0];
            if (result === undefined || alternative === undefined) continue;
            const text = alternative.transcript.trim();
            if (text.length === 0) continue;
            if (result.isFinal) {
              finalText = finalText.length === 0 ? text : `${finalText} ${text}`;
            } else if (options.onInterim !== undefined) {
              const interim: AsrTranscript =
                options.locale === undefined
                  ? Object.freeze({ text, final: false })
                  : Object.freeze({ text, final: false, locale: options.locale });
              options.onInterim(interim);
            }
          }
        };
        current.onerror = (event) => {
          const error = webSpeechError(event.error, event.message);
          if (error.code === "cancelled") {
            settle({ status: "cancelled", reason: error.message });
          } else {
            settle({ status: "rejected", error });
          }
        };
        current.onend = () => {
          if (finalText.length === 0) {
            settle({
              status: "rejected",
              error: asrError(
                "empty-transcript",
                "speech recognition produced no final text",
                true,
              ),
            });
            return;
          }
          settle({ status: "completed", transcript: finalTranscript(finalText, options.locale) });
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        try {
          current.start();
        } catch {
          settle({
            status: "rejected",
            error: asrError("provider-rejected", "speech recognition failed to start", true),
          });
        }
      });
    },
    stop(): void {
      recognition?.stop();
    },
    dispose(reason?: string): void {
      if (disposed) return;
      disposed = true;
      recognition?.abort();
      settleActive?.({ status: "cancelled", reason: reason ?? "disposed" });
      recognition = null;
      settleActive = null;
    },
  };
}
