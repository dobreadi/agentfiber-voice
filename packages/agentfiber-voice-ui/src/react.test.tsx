/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceLevelBars, VoiceOrbCanvas } from "./react.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("React voice UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts and unmounts the canvas effect when WebGL is unavailable", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => null);
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<VoiceOrbCanvas mode="reactive" level={0.8} />));
    expect(getContext).toHaveBeenCalledWith("webgl", expect.any(Object));
    act(() => root.unmount());
  });

  it("renders an SSR-safe canvas without mounting WebGL", () => {
    const markup = renderToStaticMarkup(
      <VoiceOrbCanvas mode="reactive" level={0.8} aria-label="Listening" />,
    );
    expect(markup).toContain("<canvas");
    expect(markup).toContain('aria-label="Listening"');
  });

  it("forwards DOM labels without hiding them from accessibility APIs", () => {
    const markup = renderToStaticMarkup(
      <VoiceOrbCanvas mode="breathe" id="voice-orb" aria-labelledby="voice-status" />,
    );
    expect(markup).toContain('id="voice-orb"');
    expect(markup).toContain('aria-labelledby="voice-status"');
    expect(markup).not.toContain("aria-hidden");
  });

  it("renders bounded SVG bars from a scalar capture level", () => {
    const markup = renderToStaticMarkup(
      <VoiceLevelBars level={0.5} barCount={8} accent="#e8a86a" aria-label="Input level" />,
    );
    expect(markup.match(/<rect/g)).toHaveLength(8);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('fill="#e8a86a"');
  });

  it("bounds pathological bar counts and levels", () => {
    const low = renderToStaticMarkup(<VoiceLevelBars barCount={0} level={Number.NaN} />);
    const high = renderToStaticMarkup(
      <VoiceLevelBars barCount={Number.POSITIVE_INFINITY} level={Number.POSITIVE_INFINITY} />,
    );
    expect(low.match(/<rect/g)).toHaveLength(1);
    expect(high.match(/<rect/g)).toHaveLength(12);
  });
});
