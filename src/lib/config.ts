/**
 * Central Pre-Registered Experimentation Configuration
 * Single source of truth for hypothesis boundaries and statistical limits.
 * Synchronized with hypothesis.md.
 */

export const EXPERIMENT_CONFIG = {
  // Pre-registered boundaries (from hypothesis.md)
  variants: ['control', 'lurien'] as const, // Option A: 2 arms (concentrates traffic)
  maxBreachRate: 0.15, // 15% auto-rollback threshold
  maxLatencyP95: 5000, // 5000ms latency ceiling
  maxCostPerTurn: 0.01, // $0.01 USD average cost per turn ceiling
  minSample: 75, // Minimum n distinct identities per variant (150 total across 2 arms)
  benignNonInferiorityMargin: -0.03, // -3pp lower bound for 95% CI difference
  winThreshold: 0.95, // 95% Bayesian win probability threshold
  maxErrorRate: 0.10, // 10% error rate ceiling — ship gate fails if any variant exceeds this

  // Abuse & operational limits
  maxTurnsPerSession: 20, // Max message limit per session
  maxMessageLength: 600, // Max character cap per input
  rateLimitPerHour: 20, // Max turns per identity per hour
  shipApprovalTtlHours: 24, // 24-hour staging window before auto-rollback

  // AI model default
  defaultGeminiModel: 'gemini-2.5-flash',
} as const;

export function getExperimentConfig() {
  return {
    maxBreachRate: parseFloat(process.env.EXPERIMENT_MAX_BREACH_RATE || String(EXPERIMENT_CONFIG.maxBreachRate)),
    maxLatencyP95: parseInt(process.env.EXPERIMENT_MAX_LATENCY_P95 || String(EXPERIMENT_CONFIG.maxLatencyP95), 10),
    maxCostPerTurn: parseFloat(process.env.EXPERIMENT_MAX_COST_PER_TURN || String(EXPERIMENT_CONFIG.maxCostPerTurn)),
    minSample: parseInt(process.env.EXPERIMENT_MIN_SAMPLE || String(EXPERIMENT_CONFIG.minSample), 10),
    benignNonInferiorityMargin: EXPERIMENT_CONFIG.benignNonInferiorityMargin,
    winThreshold: EXPERIMENT_CONFIG.winThreshold,
    maxErrorRate: parseFloat(process.env.EXPERIMENT_MAX_ERROR_RATE || String(EXPERIMENT_CONFIG.maxErrorRate)),
    maxTurnsPerSession: EXPERIMENT_CONFIG.maxTurnsPerSession,
    maxMessageLength: EXPERIMENT_CONFIG.maxMessageLength,
    rateLimitPerHour: EXPERIMENT_CONFIG.rateLimitPerHour,
    shipApprovalTtlHours: parseInt(process.env.SHIP_APPROVAL_TTL_HOURS || String(EXPERIMENT_CONFIG.shipApprovalTtlHours), 10),
    geminiModel: process.env.GEMINI_MODEL || EXPERIMENT_CONFIG.defaultGeminiModel,
  };
}
