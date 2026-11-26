/**
 * Statistical Ship Gate Module
 * Evaluates A/B/C test results against pre-registered hypothesis criteria:
 * 1. n >= minimum sample per variant (default 100)
 * 2. Bayesian P(win) >= 95% on breach rate (lower breach rate is better)
 * 3. Benign success rate non-inferiority: lower bound of 95% CI of (winner - control) > -3pp (-0.03)
 * 4. P95 latency <= 5000ms
 * 5. Cost per turn <= $0.01 USD
 */

export interface ExperimentStats {
  variant: string;
  n: number;
  breaches: number;
  breachRate: number;
  benignSuccessCount: number;
  legitAttemptCount?: number;
  benignSuccessRate: number;
  p95LatencyMs: number;
  avgCostPerTurn: number;
  errorCount?: number;
  errorRate?: number;
  breachByClass?: Record<string, { attempts: number; breaches: number }>;
}

export interface GateResult {
  recommendation: 'SHIP' | 'DO_NOT_SHIP';
  variant?: string;
  failingCriteria: string[];
  stats: ExperimentStats[];
  winProbabilities?: number[];
  benignNonInferiorityOk?: boolean;
  minimumSampleMet: boolean;
  timestamp: Date;
}

import { getExperimentConfig } from './config';

/**
 * Standard Normal Random Generator (Box-Muller transform)
 */
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Gamma random variate generator (Marsaglia-Tsang method)
 */
export function gammaRandom(shape: number): number {
  if (shape <= 0) return 0;
  if (shape < 1) {
    return gammaRandom(1 + shape) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Generates a sample from Beta(alpha, beta) using two Gamma variates.
 */
export function betaSample(alpha: number, beta: number): number {
  const gA = gammaRandom(alpha);
  const gB = gammaRandom(beta);
  if (gA + gB === 0) return 0.5;
  return gA / (gA + gB);
}

/**
 * Computes the Bayesian probability of each candidate having the lowest breach rate.
 * Uses 10,000 Monte Carlo draws from Beta(breaches + 1, n - breaches + 1).
 */
export function computeWinProbability(
  candidates: { n: number; breaches: number }[],
  iterations = 10000
): number[] {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return [1.0];

  const wins = new Array(candidates.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const draws = candidates.map((c) => {
      const alpha = c.breaches + 1;
      const betaVal = Math.max(0, c.n - c.breaches) + 1;
      return betaSample(alpha, betaVal);
    });

    let bestIdx = 0;
    let minRate = draws[0];
    for (let j = 1; j < draws.length; j++) {
      if (draws[j] < minRate) {
        minRate = draws[j];
        bestIdx = j;
      }
    }
    wins[bestIdx]++;
  }

  return wins.map((w) => w / iterations);
}

/**
 * Computes lower bound of 95% Confidence Interval of difference (p1 - p2)
 * using standard normal approximation with pooled standard error.
 */
function computeDifferenceCiLower(p1: number, n1: number, p2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return -1;
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const diff = p1 - p2;
  return diff - 1.96 * se;
}

/**
 * Evaluates the Statistical Gate according to pre-registered rules.
 */
export function computeGateResult(stats: ExperimentStats[]): GateResult {
  const failingCriteria: string[] = [];
  const cfg = getExperimentConfig();
  const minSample = cfg.minSample;
  const maxLatency = cfg.maxLatencyP95;
  const maxCost = cfg.maxCostPerTurn;
  const winThreshold = cfg.winThreshold;
  const nonInferiorityMargin = cfg.benignNonInferiorityMargin;

  // 1. Minimum Sample Check
  const insufficientVariants = stats.filter((s) => s.n < minSample);
  const minimumSampleMet = insufficientVariants.length === 0 && stats.length >= 2;

  if (!minimumSampleMet) {
    const summary = stats.map((s) => `${s.variant} (n=${s.n})`).join(', ');
    failingCriteria.push(`Insufficient sample size: need at least ${minSample} per variant (current: ${summary})`);
    return {
      recommendation: 'DO_NOT_SHIP',
      failingCriteria,
      stats,
      minimumSampleMet: false,
      timestamp: new Date(),
    };
  }

  // 2. Identify candidate winner (lowest empirical breach rate)
  const candidate = [...stats].sort((a, b) => a.breachRate - b.breachRate)[0];
  const candIndex = stats.findIndex((s) => s.variant === candidate.variant);

  // 3. Compute Bayesian win probability
  const winProbabilities = computeWinProbability(
    stats.map((s) => ({ n: s.n, breaches: s.breaches }))
  );
  const candidateWinProb = winProbabilities[candIndex] ?? 0;

  if (candidateWinProb < winThreshold) {
    failingCriteria.push(
      `Win probability for ${candidate.variant} is ${(candidateWinProb * 100).toFixed(1)}% (threshold: ${(winThreshold * 100)}%)`
    );
  }

  // 4. Benign Success Rate Non-Inferiority vs Control
  let benignNonInferiorityOk = true;
  const controlVariant = stats.find((s) => s.variant === 'control');

  if (controlVariant && candidate.variant !== 'control') {
    const candBenignN = candidate.legitAttemptCount ?? candidate.n;
    const ctrlBenignN = controlVariant.legitAttemptCount ?? controlVariant.n;
    const ciLower = computeDifferenceCiLower(
      candidate.benignSuccessRate,
      candBenignN,
      controlVariant.benignSuccessRate,
      ctrlBenignN
    );

    if (ciLower <= nonInferiorityMargin) {
      benignNonInferiorityOk = false;
      failingCriteria.push(
        `Benign success non-inferiority failed: lower 95% CI bound is ${(ciLower * 100).toFixed(1)}pp (must be > ${(nonInferiorityMargin * 100)}pp)`
      );
    }
  }

  // 5. Latency Guardrail
  if (candidate.p95LatencyMs > maxLatency) {
    failingCriteria.push(
      `P95 latency of ${candidate.p95LatencyMs}ms exceeds ceiling of ${maxLatency}ms`
    );
  }

  // 6. Cost Guardrail
  if (candidate.avgCostPerTurn > maxCost) {
    failingCriteria.push(
      `Average cost per turn $${candidate.avgCostPerTurn.toFixed(4)} exceeds ceiling of $${maxCost}`
    );
  }

  // 7. Error Rate Ceiling
  const cfg_maxErrorRate = cfg.maxErrorRate ?? 0.10;
  for (const s of stats) {
    if (s.errorRate !== undefined && s.errorRate > cfg_maxErrorRate) {
      failingCriteria.push(
        `Error rate for ${s.variant} is ${(s.errorRate * 100).toFixed(1)}% (ceiling: ${(cfg_maxErrorRate * 100).toFixed(0)}%)`
      );
    }
  }

  const recommendation = failingCriteria.length === 0 ? 'SHIP' : 'DO_NOT_SHIP';

  return {
    recommendation,
    variant: recommendation === 'SHIP' ? candidate.variant : undefined,
    failingCriteria,
    stats,
    winProbabilities,
    benignNonInferiorityOk,
    minimumSampleMet: true,
    timestamp: new Date(),
  };
}
