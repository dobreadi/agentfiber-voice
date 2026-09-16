import {
  type CanvasHTMLAttributes,
  type ReactElement,
  type SVGProps,
  useEffect,
  useRef,
} from "react";
import { type VoiceOrbCanvasHandle, type VoiceOrbCanvasOptions, mountVoiceOrb } from "./canvas.js";
import type { OrbMode } from "./orb.js";

export interface VoiceOrbCanvasProps
  extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "children"> {
  mode: OrbMode | "off";
  level?: number;
  accent?: readonly [number, number, number];
  maxDevicePixelRatio?: number;
  levelTickMs?: number;
  reducedMotion?: boolean;
}

/** Thin React shell over the allocation-bounded raw canvas controller. */
export function VoiceOrbCanvas({
  mode,
  level = 0,
  accent,
  maxDevicePixelRatio,
  levelTickMs,
  reducedMotion,
  "aria-label": ariaLabel,
  ...canvasProps
}: VoiceOrbCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<VoiceOrbCanvasHandle | null>(null);
  const modeRef = useRef(mode);
  const levelRef = useRef(level);
  modeRef.current = mode;
  levelRef.current = level;
  const accentRed = accent?.[0];
  const accentGreen = accent?.[1];
  const accentBlue = accent?.[2];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const resolvedAccent: VoiceOrbCanvasOptions["accent"] =
      accentRed === undefined || accentGreen === undefined || accentBlue === undefined
        ? undefined
        : [accentRed, accentGreen, accentBlue];
    const handle = mountVoiceOrb(canvas, {
      accent: resolvedAccent,
      maxDevicePixelRatio,
      levelTickMs,
      reducedMotion,
    });
    handleRef.current = handle;
    handle?.setMode(modeRef.current);
    handle?.setLevel(levelRef.current);
    return () => {
      handleRef.current = null;
      handle?.destroy();
    };
  }, [accentRed, accentGreen, accentBlue, levelTickMs, maxDevicePixelRatio, reducedMotion]);

  useEffect(() => {
    handleRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    handleRef.current?.setLevel(level);
  }, [level]);

  return (
    <canvas
      {...canvasProps}
      ref={canvasRef}
      aria-label={ariaLabel}
      aria-hidden={
        ariaLabel === undefined && canvasProps["aria-labelledby"] === undefined ? true : undefined
      }
    />
  );
}

export interface VoiceLevelBarsProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** A single capture level used when `levels` is absent. */
  level?: number;
  /** Optional recent level history, read without mutation. */
  levels?: ArrayLike<number>;
  barCount?: number;
  accent?: string;
}

function finiteUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

/**
 * DOM/SVG fallback for products that do not want WebGL. Updates occur only
 * when React receives new level data; there is no internal animation loop.
 */
export function VoiceLevelBars({
  level = 0,
  levels,
  barCount = 12,
  accent = "currentColor",
  viewBox,
  role,
  "aria-label": ariaLabel,
  ...svgProps
}: VoiceLevelBarsProps): ReactElement {
  const count = Number.isFinite(barCount) ? Math.max(1, Math.min(64, Math.floor(barCount))) : 12;
  const width = count * 4 - 2;
  const isAccessible =
    ariaLabel !== undefined || role !== undefined || svgProps["aria-labelledby"] !== undefined;
  const bars: ReactElement[] = [];
  const historyLength = levels?.length ?? 0;
  for (let index = 0; index < count; index++) {
    const historyIndex = Math.max(0, historyLength - count + index);
    const source = historyLength > 0 ? (levels?.[historyIndex] ?? 0) : level;
    const normalized = finiteUnit(source);
    const shaped =
      historyLength > 0 ? normalized : normalized * (0.45 + 0.55 * Math.abs(Math.sin(index * 1.7)));
    const height = 2 + shaped * 22;
    bars.push(
      <rect
        key={index}
        x={index * 4}
        y={(24 - height) / 2}
        width="2"
        height={height}
        rx="1"
        fill={accent}
      />,
    );
  }

  return (
    <svg
      {...svgProps}
      viewBox={viewBox ?? `0 0 ${width} 24`}
      role={role ?? (ariaLabel === undefined ? undefined : "img")}
      aria-label={ariaLabel}
      aria-hidden={isAccessible ? undefined : true}
    >
      {bars}
    </svg>
  );
}
