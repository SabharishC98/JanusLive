/**
 * Flagsmith Client & Server Management Isolation Module
 * Isolate all Flagsmith calls here per instructions.
 */

import { Flagsmith } from 'flagsmith-nodejs';

export const VARIANTS = ['control', 'lurien'] as const;
export type Variant = typeof VARIANTS[number];

export class FlagsmithUnreachableError extends Error {
  constructor(message = 'Flagsmith service unreachable') {
    super(message);
    this.name = 'FlagsmithUnreachableError';
  }
}

let _flagsmith: Flagsmith | null = null;

function getFlagsmithClient(): Flagsmith {
  if (!_flagsmith) {
    const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY || '';
    _flagsmith = new Flagsmith({
      environmentKey,
      enableLocalEvaluation: Boolean(process.env.FLAGSMITH_LOCAL_EVALUATION === 'true'),
      environmentRefreshIntervalSeconds: 60,
      apiUrl: process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/',
      enableAnalytics: true,
    });
  }
  return _flagsmith;
}

/**
 * Evaluates the 'defense_variant' feature for an anonymous identity.
 * If Flagsmith is unreachable or unconfigured, throws FlagsmithUnreachableError
 * so callers can return a 503 "busy" response and record nothing.
 * Fail closed to 'control' is NOT allowed (it would create a breach bias).
 */
export async function getVariantForIdentity(identityId: string): Promise<Variant> {
  const envKey = process.env.FLAGSMITH_ENVIRONMENT_KEY;
  if (!envKey) {
    throw new FlagsmithUnreachableError('No FLAGSMITH_ENVIRONMENT_KEY configured');
  }

  try {
    const fs = getFlagsmithClient();
    const flags = await fs.getIdentityFlags(identityId);
    const value = flags.getFeatureValue('defense_variant');

    if (value === 'control' || value === 'lurien') {
      return value;
    }

    throw new FlagsmithUnreachableError(`Unexpected variant value '${value}' returned from Flagsmith`);
  } catch (err) {
    if (err instanceof FlagsmithUnreachableError) {
      throw err;
    }
    throw new FlagsmithUnreachableError(
      `Flagsmith evaluation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Returns environment feature states for telemetry and health check.
 */
export async function getEnvironmentStats(): Promise<Record<string, unknown>> {
  try {
    const fs = getFlagsmithClient();
    const flags = await fs.getEnvironmentFlags();
    return {
      flags: flags.allFlags(),
      status: 'ok',
    };
  } catch (err) {
    console.error('[Flagsmith] Failed to fetch environment flags:', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Helper to execute authorized Flagsmith Management API requests.
 */
async function managementApiRequest(path: string, method: string, body?: unknown): Promise<unknown> {
  const token = process.env.FLAGSMITH_MANAGEMENT_API_KEY;
  if (!token) {
    throw new Error('FLAGSMITH_MANAGEMENT_API_KEY is not configured.');
  }

  const baseUrl = (process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/')
    .replace(/\/api\/v1\/?$/, '');

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Flagsmith Management API request failed [${response.status} ${response.statusText}]: ${errorText}`);
  }

  return response.json();
}

/**
 * Sets the winner variant to 100% rollout in Flagsmith via Management API.
 */
export async function setWinnerVariant(variant: Variant): Promise<void> {
  const envId = process.env.FLAGSMITH_ENVIRONMENT_ID;
  const featureId = process.env.FLAGSMITH_FEATURE_ID;
  const lurienMvId = process.env.FLAGSMITH_LURIEN_MV_ID;

  if (!envId) throw new Error('FLAGSMITH_ENVIRONMENT_ID is not configured');
  if (!featureId) throw new Error('FLAGSMITH_FEATURE_ID is not configured');

  const lurienWeight = variant === 'lurien' ? 100 : 0;
  const controlValue = variant === 'control' ? 'control' : variant;

  const variantsPayload = [];
  if (lurienMvId) {
    variantsPayload.push({
      multivariate_feature_option: parseInt(lurienMvId, 10),
      string_value: 'lurien',
      weight: lurienWeight,
    });
  }

  const payload = {
    environment_default: {
      enabled: true,
      string_value: controlValue,
      variants: variantsPayload,
    },
  };

  await managementApiRequest(`/api/__future__/environments/${envId}/features/${featureId}/`, 'PATCH', payload);
}

/**
 * Resets the multivariate flag weights back to equal 50.0% split (Option A: 2 arms).
 */
export async function rollbackToEqualSplit(): Promise<void> {
  const envId = process.env.FLAGSMITH_ENVIRONMENT_ID;
  const featureId = process.env.FLAGSMITH_FEATURE_ID;
  const lurienMvId = process.env.FLAGSMITH_LURIEN_MV_ID;

  if (!envId) throw new Error('FLAGSMITH_ENVIRONMENT_ID is not configured');
  if (!featureId) throw new Error('FLAGSMITH_FEATURE_ID is not configured');

  const variantsPayload = [];
  if (lurienMvId) {
    variantsPayload.push({
      multivariate_feature_option: parseInt(lurienMvId, 10),
      string_value: 'lurien',
      weight: 50.0, // 50% split with control base value
    });
  }

  const payload = {
    environment_default: {
      enabled: true,
      string_value: 'control',
      variants: variantsPayload,
    },
  };

  await managementApiRequest(`/api/__future__/environments/${envId}/features/${featureId}/`, 'PATCH', payload);
}
