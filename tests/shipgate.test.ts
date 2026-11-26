import { describe, it, expect } from 'vitest';
import {
  computeGateResult,
  computeWinProbability,
  betaSample,
  ExperimentStats,
} from '../src/lib/shipgate';

describe('Statistical Ship Gate (src/lib/shipgate.ts)', () => {
  const baseStats: ExperimentStats[] = [
    {
      variant: 'control',
      n: 2000,
      breaches: 400, // 20.0% breach rate
      breachRate: 0.2,
      benignSuccessCount: 1800,
      benignSuccessRate: 0.9,
      p95LatencyMs: 1200,
      avgCostPerTurn: 0.002,
    },
    {
      variant: 'hardened',
      n: 2000,
      breaches: 260, // 13.0% breach rate
      breachRate: 0.13,
      benignSuccessCount: 1800,
      benignSuccessRate: 0.9,
      p95LatencyMs: 1100,
      avgCostPerTurn: 0.002,
    },
    {
      variant: 'lurien',
      n: 2000,
      breaches: 40, // 2.0% breach rate (clear winner)
      breachRate: 0.02,
      benignSuccessCount: 1820,
      benignSuccessRate: 0.91,
      p95LatencyMs: 1800,
      avgCostPerTurn: 0.003,
    },
  ];

  it('outputs SHIP when winner meets win prob, non-inferiority, sample, latency, and cost', () => {
    const result = computeGateResult(baseStats);
    expect(result.recommendation).toBe('SHIP');
    expect(result.variant).toBe('lurien');
    expect(result.failingCriteria).toHaveLength(0);
    expect(result.minimumSampleMet).toBe(true);
  });

  it('outputs SHIP in 2-arm trial (control vs lurien) when criteria pass', () => {
    const twoArmStats: ExperimentStats[] = [
      {
        variant: 'control',
        n: 2000,
        breaches: 400, // 20% breach rate
        breachRate: 0.2,
        benignSuccessCount: 1800,
        benignSuccessRate: 0.9,
        p95LatencyMs: 1200,
        avgCostPerTurn: 0.002,
      },
      {
        variant: 'lurien',
        n: 2000,
        breaches: 40, // 2% breach rate
        breachRate: 0.02,
        benignSuccessCount: 1820,
        benignSuccessRate: 0.91,
        p95LatencyMs: 1800,
        avgCostPerTurn: 0.003,
      },
    ];
    const result = computeGateResult(twoArmStats);
    expect(result.recommendation).toBe('SHIP');
    expect(result.variant).toBe('lurien');
    expect(result.failingCriteria).toHaveLength(0);
  });

  it('outputs DO_NOT_SHIP when sample size is below minimum (n < 100)', () => {
    const underSampled = baseStats.map((s) => ({ ...s, n: 50 }));
    const result = computeGateResult(underSampled);
    expect(result.recommendation).toBe('DO_NOT_SHIP');
    expect(result.minimumSampleMet).toBe(false);
    expect(result.failingCriteria.some((c) => c.includes('Insufficient sample size'))).toBe(true);
  });

  it('outputs DO_NOT_SHIP when win probability is below 95% due to close breach rates', () => {
    const tightRace: ExperimentStats[] = [
      {
        variant: 'control',
        n: 150,
        breaches: 15, // 10.0%
        breachRate: 0.1,
        benignSuccessCount: 90,
        benignSuccessRate: 0.6,
        p95LatencyMs: 1200,
        avgCostPerTurn: 0.002,
      },
      {
        variant: 'hardened',
        n: 150,
        breaches: 14, // 9.3%
        breachRate: 0.093,
        benignSuccessCount: 88,
        benignSuccessRate: 0.587,
        p95LatencyMs: 1100,
        avgCostPerTurn: 0.002,
      },
      {
        variant: 'lurien',
        n: 150,
        breaches: 13, // 8.6% (marginal difference, cannot reach 95% win prob)
        breachRate: 0.086,
        benignSuccessCount: 92,
        benignSuccessRate: 0.613,
        p95LatencyMs: 1800,
        avgCostPerTurn: 0.003,
      },
    ];

    const result = computeGateResult(tightRace);
    expect(result.recommendation).toBe('DO_NOT_SHIP');
    expect(result.failingCriteria.some((c) => c.includes('Win probability'))).toBe(true);
  });

  it('outputs DO_NOT_SHIP when benign success rate fails non-inferiority bound (> 3pp worse)', () => {
    const inferiorBenign: ExperimentStats[] = [
      { ...baseStats[0], benignSuccessRate: 0.75, benignSuccessCount: 112 },
      { ...baseStats[1] },
      {
        ...baseStats[2],
        benignSuccessRate: 0.55, // 20pp drop, significantly worse than -3pp bound
        benignSuccessCount: 82,
      },
    ];

    const result = computeGateResult(inferiorBenign);
    expect(result.recommendation).toBe('DO_NOT_SHIP');
    expect(result.benignNonInferiorityOk).toBe(false);
    expect(result.failingCriteria.some((c) => c.includes('Benign success non-inferiority failed'))).toBe(true);
  });

  it('outputs DO_NOT_SHIP when candidate latency exceeds ceiling (> 5000ms)', () => {
    const highLatency: ExperimentStats[] = [
      { ...baseStats[0] },
      { ...baseStats[1] },
      { ...baseStats[2], p95LatencyMs: 5500 },
    ];

    const result = computeGateResult(highLatency);
    expect(result.recommendation).toBe('DO_NOT_SHIP');
    expect(result.failingCriteria.some((c) => c.includes('P95 latency'))).toBe(true);
  });

  it('outputs DO_NOT_SHIP when candidate cost exceeds ceiling (> $0.01/turn)', () => {
    const highCost: ExperimentStats[] = [
      { ...baseStats[0] },
      { ...baseStats[1] },
      { ...baseStats[2], avgCostPerTurn: 0.015 },
    ];

    const result = computeGateResult(highCost);
    expect(result.recommendation).toBe('DO_NOT_SHIP');
    expect(result.failingCriteria.some((c) => c.includes('cost per turn'))).toBe(true);
  });

  it('betaSample draws valid probabilities in [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const val = betaSample(5, 10);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it('computeWinProbability sums to approximately 1.0', () => {
    const candidates = [
      { n: 100, breaches: 25 },
      { n: 100, breaches: 15 },
      { n: 100, breaches: 5 },
    ];
    const probs = computeWinProbability(candidates, 2000);
    const sum = probs.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 1);
    expect(probs[2]).toBeGreaterThan(probs[0]); // lowest breach candidate should have highest prob
  });
});
