import type { VoiceIntentLike } from "./matcher.js";

export interface VoicePackageProvenance {
  readonly packageName: string;
  readonly version: string;
  readonly sourceRevision?: string;
}

/**
 * A dispatch request never carries ambient authority. The product supplies
 * an explicit authority value and the host decides whether it is sufficient.
 */
export interface VoiceDispatchRequest<Intent extends VoiceIntentLike, Authority> {
  readonly requestId: string;
  readonly intent: Intent;
  readonly authority: Authority;
  readonly signal: AbortSignal;
  readonly provenance: VoicePackageProvenance;
}

export type VoiceDispatchResult<Value, ErrorValue> =
  | { readonly status: "completed"; readonly value: Value }
  | { readonly status: "rejected"; readonly error: ErrorValue }
  | { readonly status: "cancelled"; readonly reason?: string };

export type VoiceDispatchPhase = "accepted" | "started" | "completed" | "rejected" | "cancelled";

/** Raw transcripts are intentionally absent; products can add audited metadata explicitly. */
export interface VoiceDispatchEvent {
  readonly requestId: string;
  readonly intentKind: string;
  readonly phase: VoiceDispatchPhase;
  readonly provenance: VoicePackageProvenance;
}

export type VoiceDispatchObserver = (event: VoiceDispatchEvent) => void;
export type VoiceHostLifecycle = "active" | "disposed";

/**
 * Transport-neutral execution boundary. Matchers propose an intent; only a
 * host with explicit authority performs effects.
 */
export interface VoiceDispatchHost<Intent extends VoiceIntentLike, Authority, Value, ErrorValue> {
  readonly lifecycle: VoiceHostLifecycle;
  dispatch(
    request: VoiceDispatchRequest<Intent, Authority>,
    observe?: VoiceDispatchObserver,
  ): VoiceDispatchResult<Value, ErrorValue> | Promise<VoiceDispatchResult<Value, ErrorValue>>;
  dispose(reason?: string): void;
}
