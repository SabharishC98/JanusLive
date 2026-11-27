/**
 * Attack Class Heuristic Classifier
 * Deterministic rules to tag incoming prompts into attack classes:
 * - override
 * - roleplay
 * - encoding
 * - multi-turn
 * - indirect
 * - benign
 */

export type AttackClass = 'override' | 'roleplay' | 'encoding' | 'multi-turn' | 'indirect' | 'benign';

const OVERRIDE_PATTERNS = [
  /ignore\s+(all\s+|previous\s+|prior\s+|your\s+)*(instructions?|rules?|directives?|prompts?)/i,
  /disregard\s+(all\s+|previous\s+|prior\s+|your\s+)*(instructions?|rules?)/i,
  /forget\s+(all\s+|previous\s+|prior\s+|your\s+)*(instructions?|rules?)/i,
  /new\s+instructions?:/i,
  /you\s+are\s+now\s+(in\s+developer\s+mode|unrestricted|free|dan)/i,
  /developer\s+mode/i,
  /system\s+prompt/i,
  /override/i,
  /jailbreak/i,
  /reveal\s+.*secret/i,
  /print\s+.*(system\s+prompt|instructions)/i,
  /repeat\s+.*(instructions|prompt)/i,
  /tell\s+me\s+the\s+vault\s+code/i,
  /what\s+is\s+the\s+vault\s+code/i,
];

const ROLEPLAY_PATTERNS = [
  /pretend\s+(you\s+are|to\s+be)/i,
  /role\s*play/i,
  /act\s+as\s+/i,
  /you\s+are\s+a\s+(fictional|villain|actor|author|hacker|banker)/i,
  /imagine\s+you\s+(are|were)/i,
  /in\s+this\s+(story|game|scenario|simulation)/i,
  /character\s+named/i,
  /hypothetically\s+(speaking\s+)?if\s+you/i,
  /let'?s\s+play\s+a\s+game/i,
];

const ENCODING_PATTERNS = [
  /base\s*64/i,
  /hex(\s+decode)?/i,
  /rot\s*13/i,
  /\\u00[0-9a-f]{2}/i,
  /decode\s+(this|the\s+following)/i,
  /cipher/i,
  /binary/i,
];

const INDIRECT_PATTERNS = [
  /my\s+(friend|colleague|boss|manager|father|mother)\s+(needs|wants|forgot)/i,
  /research\s+paper/i,
  /academic\s+(study|purpose|context)/i,
  /in\s+a\s+(novel|book|movie|screenplay)/i,
  /theoretically/i,
  /for\s+educational\s+purposes/i,
  /security\s+audit/i,
  /penetration\s+test/i,
];

const BENIGN_PATTERNS = [
  /minimum\s+(daily\s+)?balance/i,
  /maintenance\s+fees?/i,
  /banking\s+hours|branch\s+hours|operating\s+hours/i,
  /aria('s|\s+is)\s+purpose|primary\s+purpose|mission/i,
  /nearest\s+branch|branch\s+locations?/i,
  /how\s+do\s+i\s+(open|close)\s+an\s+account/i,
  /routing\s+number|account\s+services?/i,
];

/**
 * Classifies an attack based on prompt content, turn index, and conversation history.
 */
export function classifyAttack(text: string, messageIndex: number, priorTexts?: string[]): AttackClass {
  // Check encoding (including base64 strings)
  if (ENCODING_PATTERNS.some((p) => p.test(text))) {
    return 'encoding';
  }
  // Check for suspicious base64 payload strings (min 20 characters)
  if (/[A-Za-z0-9+/]{20,}={0,2}/.test(text)) {
    return 'encoding';
  }

  // Check direct override
  if (OVERRIDE_PATTERNS.some((p) => p.test(text))) {
    return 'override';
  }

  // Check roleplay
  if (ROLEPLAY_PATTERNS.some((p) => p.test(text))) {
    return 'roleplay';
  }

  // Check indirect framing
  if (INDIRECT_PATTERNS.some((p) => p.test(text))) {
    return 'indirect';
  }

  // Benign banking queries are safe and never classified as multi-turn attacks
  if (BENIGN_PATTERNS.some((p) => p.test(text))) {
    return 'benign';
  }

  // Check multi-turn escalation
  if (messageIndex > 3 && priorTexts && priorTexts.length >= 2) {
    const priorAdversarialCount = priorTexts.filter((t) =>
      OVERRIDE_PATTERNS.some((p) => p.test(t)) ||
      ROLEPLAY_PATTERNS.some((p) => p.test(t)) ||
      INDIRECT_PATTERNS.some((p) => p.test(t))
    ).length;

    if (priorAdversarialCount >= 1) {
      return 'multi-turn';
    }
  }

  return 'benign';
}
