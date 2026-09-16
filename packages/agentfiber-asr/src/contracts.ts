export type AsrLifecycle = "active" | "disposed";

export type AsrErrorCode =
  | "unsupported"
  | "permission-denied"
  | "empty-audio"
  | "empty-transcript"
  | "invalid-configuration"
  | "limit-exceeded"
  | "timeout"
  | "provider-rejected"
  | "malformed-response"
  | "network"
  | "busy"
  | "cancelled"
  | "disposed";

export interface AsrError {
  readonly code: AsrErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
}

export interface AsrAudio {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly durationMs?: number;
  readonly fileName?: string;
}

export interface AsrTranscript {
  readonly text: string;
  readonly final: boolean;
  readonly locale?: string;
}

export interface AsrTranscriptionRequest {
  readonly requestId: string;
  readonly audio: AsrAudio;
  readonly locale?: string;
  readonly signal: AbortSignal;
}

export type AsrTranscriptionResult =
  | { readonly status: "completed"; readonly transcript: AsrTranscript }
  | { readonly status: "rejected"; readonly error: AsrError }
  | { readonly status: "cancelled"; readonly reason?: string };

export interface AsrTranscriber {
  readonly lifecycle: AsrLifecycle;
  transcribe(request: AsrTranscriptionRequest): Promise<AsrTranscriptionResult>;
  dispose(reason?: string): void;
}

export interface AsrTranscriptSourceOptions {
  readonly locale?: string;
  readonly signal: AbortSignal;
  readonly onInterim?: (transcript: AsrTranscript) => void;
}

export interface AsrTranscriptSource {
  readonly lifecycle: AsrLifecycle;
  start(options: AsrTranscriptSourceOptions): Promise<AsrTranscriptionResult>;
  stop(): void;
  dispose(reason?: string): void;
}

export function asrError(
  code: AsrErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AsrError {
  return status === undefined
    ? Object.freeze({ code, message, retryable })
    : Object.freeze({ code, message, retryable, status });
}

export function finalTranscript(text: string, locale?: string): AsrTranscript {
  const normalized = text.trim();
  return locale === undefined
    ? Object.freeze({ text: normalized, final: true })
    : Object.freeze({ text: normalized, final: true, locale });
}
