'use client';

import React, { useState, useEffect } from 'react';
import { GateResult } from '@/lib/shipgate';

interface ShipApiResponse {
  gate: GateResult;
  pendingApproval: {
    id: string;
    variant: string;
    approver: string;
    approved_at: string;
    expires_at: string;
    confirmed: number;
    rolled_back: number;
  } | null;
}

export default function ShipGatePage() {
  const [data, setData] = useState<ShipApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Post-ship verification test state
  const [replayVariant, setReplayVariant] = useState<'lurien' | 'control'>('lurien');
  const [replayResult, setReplayResult] = useState<{
    replayed: number;
    rebreached: number;
    errors: number;
    variant?: string;
    empty?: boolean;
    reason?: string;
  } | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  const fetchGateData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/ship');
      if (!res.ok) throw new Error('Failed to fetch ship gate telemetry');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error loading gate state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGateData();
  }, []);

  const handleAction = async (action: 'approve' | 'confirm' | 'cancel') => {
    if (!adminPassword) {
      setErrorMessage('Admin authentication password required.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setActionLoading(true);

    try {
      const res = await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action,
          variant: data?.gate.variant,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || resData.message || 'Action failed');
      }

      setStatusMessage(resData.message || `Action ${action} succeeded.`);
      await fetchGateData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to execute ship gate action');
    } finally {
      setActionLoading(false);
    }
  };

  async function runReplay() {
    if (!adminPassword) {
      setReplayError('Admin authentication password required to run replay suite.');
      return;
    }
    setReplayLoading(true);
    setReplayError(null);
    setReplayResult(null);
    try {
      const res = await fetch('/api/ship/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          variant: replayVariant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Replay failed');
      setReplayResult(data);
    } catch (e: unknown) {
      setReplayError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setReplayLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="py-24 text-center font-mono text-zinc-500 text-sm">
        <span className="inline-block animate-spin mr-2">⚙️</span>
        Evaluating statistical gate boundaries against Flagsmith experiment data...
      </div>
    );
  }

  const gate = data?.gate;
  const pending = data?.pendingApproval;
  const canShip = gate?.recommendation === 'SHIP';

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Title */}
      <div className="border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-1">
          <span>GOVERNANCE & DEPLOYMENT</span>
          <span>/</span>
          <span>STATISTICAL GATE</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Statistical Ship Gate</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Automated evaluation of Bayesian win probability, non-inferiority margins, latency and cost constraints.
        </p>
      </div>

      {/* Primary Gate Recommendation Banner */}
      <div
        className={`p-6 sm:p-8 rounded-2xl border ${
          canShip
            ? 'border-emerald-500/60 bg-emerald-950/20 text-emerald-200'
            : 'border-rose-500/60 bg-rose-950/20 text-rose-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider opacity-75">
              Gate Decision
            </div>
            <div className="text-4xl font-extrabold font-mono tracking-tight mt-1 flex items-center gap-3">
              <span>{canShip ? '🚀 SHIP CANDIDATE' : '🛑 DO NOT SHIP'}</span>
            </div>
            {canShip && gate.variant && (
              <div className="text-sm font-mono mt-2 text-emerald-300 font-bold">
                Recommended Variant: <span className="uppercase text-white underline">{gate.variant}</span>
              </div>
            )}
          </div>

          {gate?.winProbabilities && (
            <div className="text-right font-mono">
              <div className="text-xs text-zinc-400">Winning Probabilities</div>
              <div className="text-sm text-zinc-200 mt-1 space-x-2">
                {gate.stats.map((s, idx) => (
                  <span key={s.variant} className="text-xs">
                    {s.variant}: <strong className="text-white">{((gate.winProbabilities?.[idx] ?? 0) * 100).toFixed(1)}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Failing Criteria Log */}
        {gate && gate.failingCriteria.length > 0 && (
          <div className="mt-6 pt-4 border-t border-rose-800/40 space-y-2">
            <div className="text-xs font-mono uppercase font-bold text-rose-400">
              Unmet Criteria ({gate.failingCriteria.length}):
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono text-rose-300">
              {gate.failingCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pending Staged Rollout Banner */}
      {pending && (
        <div className="p-5 rounded-xl border border-indigo-500/60 bg-indigo-950/30 text-indigo-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono font-bold text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>STAGED ROLLOUT ACTIVE: {pending.variant.toUpperCase()}</span>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              Expires: {new Date(pending.expires_at).toLocaleString()}
            </span>
          </div>

          <p className="text-xs text-indigo-300">
            Aria is currently serving 100% of traffic on <strong className="text-white">{pending.variant}</strong>.
            The rollout is time-limited to 24 hours. Confirm to make permanent, or cancel to auto-revert to equal split.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAction('confirm')}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold"
            >
              Confirm Permanent Rollout
            </button>
            <button
              type="button"
              onClick={() => handleAction('cancel')}
              disabled={actionLoading}
              className="px-4 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 border border-rose-700 text-rose-200 font-mono text-xs font-semibold"
            >
              Cancel & Rollback (33.33% Split)
            </button>
          </div>
        </div>
      )}

      {/* Admin Action Console */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🔐</span> Human Approval Console
        </h2>
        <p className="text-xs text-zinc-400">
          Rollouts modify the live Flagsmith multivariate feature flag configuration. Administrative authorization is required.
        </p>

        {statusMessage && (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs font-mono">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Enter ADMIN_PASSWORD..."
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 font-mono"
          />

          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={actionLoading || !canShip || Boolean(pending)}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold text-xs font-mono transition-colors shadow-md flex items-center justify-center gap-2"
          >
            {actionLoading ? 'Executing...' : 'Approve Staged Rollout (24h) →'}
          </button>
        </div>
      </div>

      {/* Post-Ship Verification Section */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🛡️</span> Post-Ship Attack Replay Verification
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Replay top 20 historical successful attacks against the candidate to verify real-world efficacy.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={replayVariant}
              onChange={(e) => setReplayVariant(e.target.value as 'lurien' | 'control')}
              aria-label="Replay target variant"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="lurien">lurien</option>
              <option value="control">control</option>
            </select>
            <button
              type="button"
              onClick={runReplay}
              disabled={replayLoading}
              className="px-4 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-zinc-200 text-xs font-mono transition-colors"
            >
              {replayLoading ? 'Replaying Attacks...' : 'Run Replay Suite'}
            </button>
          </div>
        </div>

        {replayError && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono">
            {replayError}
          </div>
        )}

        {replayResult && (
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 font-mono text-xs space-y-2">
            {replayResult.empty ? (
              <div className="text-zinc-400">
                No breaches to replay yet — run the experiment to collect breach data
                {replayResult.reason ? ` (${replayResult.reason})` : ''}.
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-zinc-200">
                  [{replayResult.variant ?? replayVariant}] Replayed {replayResult.replayed} sessions — {replayResult.rebreached} re-breached (
                  {replayResult.replayed > 0 ? ((replayResult.rebreached / replayResult.replayed) * 100).toFixed(1) : '0.0'}%)
                  {replayResult.errors > 0 && (
                    <span className="ml-2 text-amber-400">· {replayResult.errors} errors</span>
                  )}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold ${
                    replayResult.replayed === 0
                      ? 'bg-amber-950 text-amber-300'
                      : replayResult.rebreached / replayResult.replayed <= 0.15
                      ? 'bg-emerald-950 text-emerald-300'
                      : 'bg-rose-950 text-rose-300'
                  }`}
                >
                  {replayResult.replayed === 0
                    ? 'INCOMPLETE (ERRORS)'
                    : replayResult.rebreached / replayResult.replayed <= 0.15
                    ? 'PASSED'
                    : 'FAILED'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
