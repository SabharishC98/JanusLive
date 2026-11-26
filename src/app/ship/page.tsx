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
      <div className="py-24 text-center font-mono text-[#78716C] text-sm font-semibold">
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
      <div className="border-b border-[#E7D5C0] pb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-[#78716C] mb-1 font-bold">
          <span>GOVERNANCE & DEPLOYMENT</span>
          <span>/</span>
          <span>STATISTICAL GATE</span>
        </div>
        <h1 className="text-3xl font-black text-[#1C1917]">Statistical Ship Gate</h1>
        <p className="text-sm text-[#78716C] mt-1 font-medium">
          Automated evaluation of Bayesian win probability, non-inferiority margins, latency and cost constraints.
        </p>
      </div>

      {/* Primary Gate Recommendation Banner */}
      <div
        className={`p-6 sm:p-8 rounded-2xl border shadow-sm ${
          canShip
            ? 'border-[#BFE23A] bg-[#FFF7EE] text-[#1C1917]'
            : 'border-[#FCA5A5] bg-[#FFF1F0] text-[#1C1917]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-black uppercase tracking-wider text-[#78716C]">
              Gate Decision
            </div>
            <div className="text-4xl font-black font-mono tracking-tight mt-1 flex items-center gap-3">
              <span className={canShip ? 'text-[#4D7C0F]' : 'text-[#E10600]'}>
                {canShip ? '🚀 SHIP CANDIDATE' : '🛑 DO NOT SHIP'}
              </span>
            </div>
            {canShip && gate.variant && (
              <div className="text-sm font-mono mt-2 text-[#4D7C0F] font-bold">
                Recommended Variant: <span className="uppercase text-[#1C1917] underline">{gate.variant}</span>
              </div>
            )}
          </div>

          {gate?.winProbabilities && (
            <div className="text-right font-mono">
              <div className="text-xs text-[#78716C] font-semibold">Winning Probabilities</div>
              <div className="text-sm text-[#1C1917] mt-1 space-x-2 font-bold">
                {gate.stats.map((s, idx) => (
                  <span key={s.variant} className="text-xs">
                    {s.variant}: <strong className="text-[#1C1917] font-black">{((gate.winProbabilities?.[idx] ?? 0) * 100).toFixed(1)}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Failing Criteria Log */}
        {gate && gate.failingCriteria.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[#FCA5A5] space-y-2">
            <div className="text-xs font-mono uppercase font-black text-[#E10600]">
              Unmet Criteria ({gate.failingCriteria.length}):
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono text-[#991B1B] font-semibold">
              {gate.failingCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pending Staged Rollout Banner */}
      {pending && (
        <div className="p-5 rounded-2xl border border-[#BFE23A] bg-[#FFF7EE] text-[#1C1917] space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono font-black text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E10600] animate-ping" />
              <span>STAGED ROLLOUT ACTIVE: {pending.variant.toUpperCase()}</span>
            </div>
            <span className="text-xs font-mono text-[#78716C] font-semibold">
              Expires: {new Date(pending.expires_at).toLocaleString()}
            </span>
          </div>

          <p className="text-xs text-[#57534E]">
            Aria is currently serving 100% of traffic on <strong className="text-[#1C1917] font-black">{pending.variant}</strong>.
            The rollout is time-limited to 24 hours. Confirm to make permanent, or cancel to auto-revert to equal split.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAction('confirm')}
              disabled={actionLoading}
              className="px-4 py-2 rounded-full bg-[#4D7C0F] hover:bg-[#3F6212] text-white font-mono text-xs font-bold shadow-sm"
            >
              Confirm Permanent Rollout
            </button>
            <button
              type="button"
              onClick={() => handleAction('cancel')}
              disabled={actionLoading}
              className="px-4 py-2 rounded-full bg-[#FFF1F0] hover:bg-[#FEE2E2] border border-[#FCA5A5] text-[#E10600] font-mono text-xs font-bold"
            >
              Cancel & Rollback (Equal Split)
            </button>
          </div>
        </div>
      )}

      {/* Admin Action Console */}
      <div className="p-6 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] space-y-4 shadow-sm">
        <h2 className="text-lg font-black text-[#1C1917] flex items-center gap-2">
          <span>🔐</span> Human Approval Console
        </h2>
        <p className="text-xs text-[#78716C]">
          Rollouts modify the live Flagsmith multivariate feature flag configuration. Administrative authorization is required.
        </p>

        {statusMessage && (
          <div className="p-3.5 rounded-xl bg-[#ECFCCB] border border-[#D9F99D] text-[#4D7C0F] text-xs font-mono font-bold">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] text-xs font-mono font-bold">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Enter ADMIN_PASSWORD..."
            className="flex-1 rounded-full border border-[#E7D5C0] bg-[#FFF7EE] px-4 py-2 text-sm text-[#1C1917] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#E10600] font-mono shadow-inner"
          />

          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={actionLoading || !canShip || Boolean(pending)}
            className="px-6 py-2 rounded-full bg-[#E10600] hover:bg-[#B80500] disabled:bg-[#E7D5C0] disabled:text-[#A8A29E] text-white font-bold text-xs font-mono transition-colors shadow-md flex items-center justify-center gap-2"
          >
            {actionLoading ? 'Executing...' : 'Approve Staged Rollout (24h) →'}
          </button>
        </div>
      </div>

      {/* Post-Ship Verification Section */}
      <div className="p-6 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] space-y-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-black text-[#1C1917] flex items-center gap-2">
              <span>🛡️</span> Post-Ship Attack Replay Verification
            </h2>
            <p className="text-xs text-[#78716C] mt-0.5">
              Replay top 20 historical successful attacks against the candidate to verify real-world efficacy.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={replayVariant}
              onChange={(e) => setReplayVariant(e.target.value as 'lurien' | 'control')}
              aria-label="Replay target variant"
              className="rounded-full border border-[#E7D5C0] bg-[#FFF7EE] px-3.5 py-1.5 text-xs font-mono text-[#1C1917] font-bold focus:outline-none focus:border-[#E10600]"
            >
              <option value="lurien">lurien</option>
              <option value="control">control</option>
            </select>
            <button
              type="button"
              onClick={runReplay}
              disabled={replayLoading}
              className="px-4 py-1.5 rounded-full border border-[#1C1917] bg-[#FFF7EE] hover:bg-[#BFE23A] disabled:opacity-50 text-[#1C1917] text-xs font-mono font-bold transition-colors shadow-sm"
            >
              {replayLoading ? 'Replaying Attacks...' : 'Run Replay Suite'}
            </button>
          </div>
        </div>

        {replayError && (
          <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] text-xs font-mono font-bold">
            {replayError}
          </div>
        )}

        {replayResult && (
          <div className="p-4 rounded-xl border border-[#E7D5C0] bg-[#F9EAD7]/50 font-mono text-xs space-y-2">
            {replayResult.empty ? (
              <div className="text-[#78716C] font-semibold">
                No breaches to replay yet — run the experiment to collect breach data
                {replayResult.reason ? ` (${replayResult.reason})` : ''}.
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-[#1C1917]">
                  [{replayResult.variant ?? replayVariant}] Replayed {replayResult.replayed} sessions — {replayResult.rebreached} re-breached (
                  {replayResult.replayed > 0 ? ((replayResult.rebreached / replayResult.replayed) * 100).toFixed(1) : '0.0'}%)
                  {replayResult.errors > 0 && (
                    <span className="ml-2 text-[#E10600]">· {replayResult.errors} errors</span>
                  )}
                </span>
                <span
                  className={`px-3 py-1 rounded-full font-black text-xs ${
                    replayResult.replayed === 0
                      ? 'bg-[#FEF3C7] text-[#92400E]'
                      : replayResult.rebreached / replayResult.replayed <= 0.15
                      ? 'bg-[#ECFCCB] text-[#4D7C0F]'
                      : 'bg-[#FEE2E2] text-[#E10600]'
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
