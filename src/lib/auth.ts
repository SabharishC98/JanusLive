import { timingSafeEqual } from 'crypto';

/**
 * Checks whether the ADMIN_PASSWORD environment variable meets the security criteria:
 * - Must be configured
 * - Must NOT equal 'changeme'
 * - Must be at least 12 characters long
 */
export function isPasswordConfigValid(): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === 'changeme' || expected.length < 12) {
    return false;
  }
  return true;
}

/**
 * Constant-time comparison against ADMIN_PASSWORD.
 * Refuses authorization if ADMIN_PASSWORD is unset, equals 'changeme', or is < 12 chars.
 */
export function verifyAdminPassword(provided: unknown): boolean {
  if (typeof provided !== 'string' || !provided) {
    return false;
  }
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === 'changeme' || expected.length < 12) {
    return false;
  }

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies Authorization: Bearer {CRON_SECRET} header.
 */
export function verifyCronSecret(authHeader: string | null): boolean {
  if (!authHeader) return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return false;
  }

  const token = parts[1];
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
