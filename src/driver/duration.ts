import { FlowliStrategyError } from "../core/errors.js";
import type { DelayValue } from "../core/types.js";

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDelay(delay: DelayValue): number {
  if (typeof delay === "number") {
    if (!Number.isFinite(delay) || delay < 0) {
      throw new FlowliStrategyError(
        "Delay must be a non-negative finite number.",
      );
    }

    return delay;
  }

  const match = /^(\d+)(ms|s|m|h|d)$/.exec(delay);

  if (!match) {
    throw new FlowliStrategyError(
      `Invalid delay value "${delay}". Expected a number or a duration string like "5m".`,
    );
  }

  const value = Number(match[1]);
  const unit = match[2];

  return value * DURATION_UNITS[unit as keyof typeof DURATION_UNITS]!;
}
