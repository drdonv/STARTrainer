/**
 * STAR phase durations from first pattern hit (proxy, not true NLP segmentation).
 * Penalties are piecewise-linear with a single cap on the total timing deduction.
 */

import type { HeuristicState, StarLetter, StarSegmentSeconds } from "@/lib/types";

/** Target bands (seconds) — single source of truth for scoring + prompts. */
export const STAR_TIMING_TARGETS = {
  preambleGraceS: 10,
  totalMinS: 120,
  totalMaxS: 180,
  sIdealS: 30,
  sOverSoftS: 40,
  tIdealS: 15,
  tOverSoftS: 25,
  aIdealMinS: 60,
  aIdealMaxS: 80,
  aThinS: 45,
  aRambleSoftS: 100,
  rIdealMaxS: 30,
  rOverSoftS: 40,
} as const;

const TOTAL_SOFT_LOW_S = 90;
const TOTAL_HARD_HIGH_S = 240;
const S_OVER_HARD_S = 52;
const T_OVER_HARD_S = 32;
const A_RAMBLE_HARD_S = 118;
const A_VERY_THIN_S = 18;
const R_OVER_HARD_S = 52;

const PREAMBLE_PER_S = 0.45;
const PREAMBLE_MAX = 6;

/** Max points subtracted for all timing (preamble + phases). */
export const STAR_TIMING_PENALTY_CAP = 20;

function linearOver(
  value: number,
  soft: number,
  hard: number,
  maxPts: number
): number {
  if (value <= soft) return 0;
  if (value >= hard) return maxPts;
  return (maxPts * (value - soft)) / (hard - soft);
}

function linearUnder(
  value: number,
  soft: number,
  hard: number,
  maxPts: number
): number {
  if (value >= soft) return 0;
  if (value <= hard) return maxPts;
  return (maxPts * (soft - value)) / (soft - hard);
}

export function preamblePenaltyPoints(
  firstSeenS: number | undefined,
  answerStartMs: number,
  nowMs: number
): number {
  if (firstSeenS != null) return 0;
  const elapsed = (nowMs - answerStartMs) / 1000;
  if (elapsed <= STAR_TIMING_TARGETS.preambleGraceS) return 0;
  return Math.min(
    PREAMBLE_MAX,
    (elapsed - STAR_TIMING_TARGETS.preambleGraceS) * PREAMBLE_PER_S
  );
}

export function computeStarSegmentSeconds(
  firstSeen: Partial<Record<StarLetter, number>>,
  answerStartMs: number,
  nowMs: number
): StarSegmentSeconds {
  const s0 = firstSeen.S;
  const t0 = firstSeen.T;
  const a0 = firstSeen.A;
  const r0 = firstSeen.R;

  const total = Math.max(0, (nowMs - answerStartMs) / 1000);

  let S = 0;
  if (s0 != null) {
    const candidates: number[] = [];
    if (t0 != null && t0 > s0) candidates.push(t0);
    if (a0 != null && a0 > s0) candidates.push(a0);
    const endS = candidates.length > 0 ? Math.min(...candidates) : nowMs;
    S = Math.max(0, (endS - s0) / 1000);
  }

  let T = 0;
  if (t0 != null) {
    const endT = a0 != null && a0 > t0 ? a0 : nowMs;
    T = Math.max(0, (endT - t0) / 1000);
  }

  let A = 0;
  if (a0 != null) {
    const endA = r0 != null && r0 > a0 ? r0 : nowMs;
    A = Math.max(0, (endA - a0) / 1000);
  }

  let R = 0;
  if (r0 != null) {
    R = Math.max(0, (nowMs - r0) / 1000);
  }

  return { S, T, A, R, total };
}

export function computeStarSegmentsForState(
  state: Pick<HeuristicState, "starFirstSeen" | "answerStartTime">,
  nowMs: number
): StarSegmentSeconds {
  return computeStarSegmentSeconds(
    state.starFirstSeen,
    state.answerStartTime,
    nowMs
  );
}

export function formatStarTimingContext(
  state: Pick<HeuristicState, "starFirstSeen" | "answerStartTime">,
  nowMs: number
): string {
  const seg = computeStarSegmentsForState(state, nowMs);
  const wall = (nowMs - state.answerStartTime) / 1000;
  const firstS = state.starFirstSeen.S;
  const g = STAR_TIMING_TARGETS.preambleGraceS;
  const toS =
    firstS === undefined
      ? `no S yet at ${Math.round(wall)}s (target: situation within ~${g}s)`
      : `first S at +${Math.round((firstS - state.answerStartTime) / 1000)}s`;
  return (
    `Pacing: wall ${Math.round(wall)}s | segments S=${Math.round(seg.S)}s T=${Math.round(seg.T)}s A=${Math.round(seg.A)}s R=${Math.round(seg.R)}s | ${toS}. ` +
    `Targets: total ~2–3min; S~30s; T~15s; A~60–80s (longest); R~15–30s.`
  );
}

/**
 * Timing penalty (points to subtract). Capped globally.
 * Over-long A is only scored when R exists or total already exceeds the high band.
 */
export function starTimingPenalty(
  segments: StarSegmentSeconds,
  firstSeen: Partial<Record<StarLetter, number>>,
  answerStartMs: number,
  nowMs: number
): number {
  const preamble = preamblePenaltyPoints(firstSeen.S, answerStartMs, nowMs);
  let phase = 0;

  phase += linearUnder(
    segments.total,
    STAR_TIMING_TARGETS.totalMinS,
    TOTAL_SOFT_LOW_S,
    3
  );
  phase += linearOver(
    segments.total,
    STAR_TIMING_TARGETS.totalMaxS,
    TOTAL_HARD_HIGH_S,
    4
  );

  if (firstSeen.S != null) {
    phase += linearOver(
      segments.S,
      STAR_TIMING_TARGETS.sOverSoftS,
      S_OVER_HARD_S,
      4
    );
  }

  if (firstSeen.T != null) {
    phase += linearOver(
      segments.T,
      STAR_TIMING_TARGETS.tOverSoftS,
      T_OVER_HARD_S,
      3
    );
  }

  const canPenalizeLongA =
    firstSeen.R != null || segments.total > STAR_TIMING_TARGETS.totalMaxS;
  if (firstSeen.A != null && canPenalizeLongA) {
    phase += linearOver(
      segments.A,
      STAR_TIMING_TARGETS.aRambleSoftS,
      A_RAMBLE_HARD_S,
      5
    );
  }

  if (firstSeen.A != null && firstSeen.R != null) {
    phase += linearUnder(
      segments.A,
      STAR_TIMING_TARGETS.aThinS,
      A_VERY_THIN_S,
      3
    );
  }

  if (firstSeen.R != null) {
    phase += linearOver(
      segments.R,
      STAR_TIMING_TARGETS.rOverSoftS,
      R_OVER_HARD_S,
      3
    );
  }

  return Math.min(STAR_TIMING_PENALTY_CAP, preamble + phase);
}

export function starTimingPenaltyForState(
  state: HeuristicState,
  nowMs: number
): number {
  const segments = computeStarSegmentSeconds(
    state.starFirstSeen,
    state.answerStartTime,
    nowMs
  );
  return starTimingPenalty(
    segments,
    state.starFirstSeen,
    state.answerStartTime,
    nowMs
  );
}
