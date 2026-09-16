import {
  type AsrError,
  type AsrTranscriber,
  type AsrTranscript,
  type AsrTranscriptionRequest,
  type AsrTranscriptionResult,
  asrError,
  finalTranscript,
} from "./contracts.js";

export interface EncodedAsrHttpRequest {
  readonly body: BodyInit;
  readonly headers?: Readonly<Record<string, string>>;
}

export type AsrHttpRequestEncoder = (
  request: AsrTranscriptionRequest,
) => EncodedAsrHttpRequest | Promise<EncodedAsrHttpRequest>;

export type AsrHttpResponseParser = (
  response: Response,
  request: AsrTranscriptionRequest,
) => AsrTranscript | Promise<AsrTranscript>;

export interface HttpAsrTranscriberOptions {
  readonly endpoint: string | ((request: AsrTranscriptionRequest) => string);
  readonly fetch: typeof fetch;
  readonly timeoutMs?: number;
  readonly credentials?: RequestCredentials;
  readonly headers?:
    | Readonly<Record<string, string>>
    | ((request: AsrTranscriptionRequest) => Readonly<Record<string, string>>);
  readonly encodeRequest?: AsrHttpRequestEncoder;
  readonly parseResponse?: AsrHttpResponseParser;
}

export interface OpenAiCompatibleWhisperOptions
  extends Omit<HttpAsrTranscriberOptions, "encodeRequest" | "parseResponse"> {
  readonly model: string;
  readonly responseFormat?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function validateTimeout(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }
  return timeoutMs;
}

function rawAudioEncoder(request: AsrTranscriptionRequest): EncodedAsrHttpRequest {
  return {
    body: request.audio.bytes as unknown as BodyInit,
    headers: Object.freeze({ "Content-Type": request.audio.contentType }),
  };
}

async function jsonTranscriptParser(
  response: Response,
  request: AsrTranscriptionRequest,
): Promise<AsrTranscript> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw asrError("malformed-response", "ASR response is not valid JSON", false);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    typeof Reflect.get(value, "text") !== "string"
  ) {
    throw asrError("malformed-response", "ASR response does not contain text", false);
  }
  const transcript = finalTranscript(Reflect.get(value, "text") as string, request.locale);
  if (transcript.text.length === 0) {
    throw asrError("empty-transcript", "ASR response contains no transcript", true);
  }
  return transcript;
}

function isAsrError(value: unknown): value is AsrError {
  if (value === null || typeof value !== "object") return false;
  return (
    typeof Reflect.get(value, "code") === "string" &&
    typeof Reflect.get(value, "message") === "string" &&
    typeof Reflect.get(value, "retryable") === "boolean"
  );
}

export function createHttpAsrTranscriber(options: HttpAsrTranscriberOptions): AsrTranscriber {
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const encodeRequest = options.encodeRequest ?? rawAudioEncoder;
  const parseResponse = options.parseResponse ?? jsonTranscriptParser;
  const active = new Set<AbortController>();
  let disposed = false;

  return {
    get lifecycle() {
      return disposed ? "disposed" : "active";
    },
    async transcribe(request: AsrTranscriptionRequest): Promise<AsrTranscriptionResult> {
      if (disposed) {
        return {
          status: "rejected",
          error: asrError("disposed", "ASR transcriber is disposed", false),
        };
      }
      if (request.signal.aborted) {
        return { status: "cancelled", reason: "request signal was already aborted" };
      }
      if (request.audio.bytes.length === 0) {
        return {
          status: "rejected",
          error: asrError("empty-audio", "ASR audio is empty", true),
        };
      }

      const controller = new AbortController();
      active.add(controller);
      let timedOut = false;
      const onAbort = (): void => controller.abort(request.signal.reason);
      request.signal.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort("timeout");
      }, timeoutMs);

      try {
        const encoded = await encodeRequest(request);
        if (disposed) {
          return {
            status: "rejected",
            error: asrError("disposed", "ASR transcriber was disposed", false),
          };
        }
        const endpoint =
          typeof options.endpoint === "function" ? options.endpoint(request) : options.endpoint;
        const commonHeaders =
          typeof options.headers === "function" ? options.headers(request) : options.headers;
        const headers = { ...commonHeaders, ...encoded.headers };
        const response = await options.fetch(endpoint, {
          method: "POST",
          credentials: options.credentials,
          headers,
          body: encoded.body,
          signal: controller.signal,
        });
        if (!response.ok) {
          return {
            status: "rejected",
            error: asrError(
              "provider-rejected",
              `ASR provider rejected the request with ${response.status}`,
              response.status >= 500 || response.status === 429,
              response.status,
            ),
          };
        }
        const transcript = await parseResponse(response, request);
        if (disposed) {
          return {
            status: "rejected",
            error: asrError("disposed", "ASR transcriber was disposed", false),
          };
        }
        if (request.signal.aborted) {
          return { status: "cancelled", reason: "request signal was aborted" };
        }
        return { status: "completed", transcript: Object.freeze({ ...transcript, final: true }) };
      } catch (error) {
        if (disposed) {
          return {
            status: "rejected",
            error: asrError("disposed", "ASR transcriber was disposed", false),
          };
        }
        if (request.signal.aborted) {
          return { status: "cancelled", reason: "request signal was aborted" };
        }
        if (timedOut) {
          return {
            status: "rejected",
            error: asrError("timeout", `ASR request exceeded ${timeoutMs} ms`, true),
          };
        }
        if (isAsrError(error)) return { status: "rejected", error };
        return {
          status: "rejected",
          error: asrError("network", "ASR request failed", true),
        };
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onAbort);
        active.delete(controller);
      }
    },
    dispose(reason?: string): void {
      if (disposed) return;
      disposed = true;
      for (const controller of active) controller.abort(reason ?? "disposed");
      active.clear();
    },
  };
}

export function createOpenAiCompatibleWhisperTranscriber(
  options: OpenAiCompatibleWhisperOptions,
): AsrTranscriber {
  if (options.model.trim().length === 0) throw new Error("model must not be empty");
  return createHttpAsrTranscriber({
    ...options,
    encodeRequest(request) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([request.audio.bytes], { type: request.audio.contentType }),
        request.audio.fileName ?? "audio.wav",
      );
      form.append("model", options.model);
      if (request.locale !== undefined) form.append("language", request.locale);
      if (options.responseFormat !== undefined)
        form.append("response_format", options.responseFormat);
      return { body: form };
    },
    parseResponse: jsonTranscriptParser,
  });
}
