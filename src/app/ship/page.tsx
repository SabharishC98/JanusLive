'use client';

import React, { useState, useEffect } from 'react';
import { GateResult } from '@/lib/shipgate';
import { SudarIcon } from '@/components/SudarIcon';

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

  const runReplay = async () => {
    setReplayLoading(true);
    setReplayError(null);
    setReplayResult(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: replayVariant }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Replay suite execution failed');
      }

      setReplayResult(resData);
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : 'Unknown replay suite failure');
    } finally {
      setReplayLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-24 text-center font-mono text-sm text-[#FFFFFF] space-y-3">
        <div className="w-8 h-8 border-2 border-[#6C5636] border-t-[#FFFFFF] rounded-full animate-spin mx-auto" />
        <div>Evaluating Bayesian Ship Gate Rules...</div>
      </div>
    );
  }

  const gate = data?.gate;
  const pending = data?.pendingApproval;
  const canShip = gate?.recommendation === 'SHIP';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-[#6C5636]/40 pb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-[#D6CFC4]/80 mb-1 font-bold">
          <span>GOVERNANCE &amp; DEPLOYMENT</span>
          <span>/</span>
          <span>STATISTICAL SHIP GATE</span>
        </div>
        <h1 className="text-3xl font-serif font-black text-[#FFFFFF] tracking-wide flex items-center gap-3">
          <SudarIcon name="vault" size={28} />
          <span>Statistical Ship Gate</span>
        </h1>
        <p className="text-sm text-[#D6CFC4]/80 mt-1 font-medium font-sans">
          Automated evaluation of Bayesian win probability, benign non-inferiority margins, latency limits, and operational costs.
        </p>
      </div>

      {/* Primary Gate Recommendation Banner */}
      <div
        className={`sudarkalam-frame p-6 sm:p-8 rounded-2xl shadow-2xl ${
          canShip ? 'border-[#6C5636] bg-[#10140F]/90' : 'border-[#6C5636]/50 bg-[#13120E]/90'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#FFFFFF]/80">
              Gate Verdict
            </div>
            <div className="text-3xl sm:text-4xl font-serif font-black tracking-wide mt-1.5 flex items-center gap-3">
              {canShip ? (
                <span className="text-[#FFFFFF] flex items-center gap-2.5">
                  <SudarIcon name="vault" size={32} />
                  <span>SHIP CANDIDATE</span>
                </span>
              ) : (
                <span className="text-[#C23B22] flex items-center gap-2.5">
                  <SudarIcon name="shield" size={32} />
                  <span>DO NOT SHIP</span>
                </span>
              )}
            </div>
            {canShip && gate.variant && (
              <div className="text-sm font-mono mt-2 text-[#FFFFFF] font-bold">
                Recommended Variant: <span className="uppercase text-[#FFFFFF] underline">{gate.variant}</span>
              </div>
            )}
          </div>

          {gate?.winProbabilities && (
            <div className="text-right font-mono">
              <div className="text-xs text-[#D6CFC4]/70 font-semibold">Winning Probabilities</div>
              <div className="text-sm text-[#FFFFFF] mt-1 space-x-3 font-bold">
                {gate.stats.map((s, idx) => (
                  <span key={s.variant} className="text-xs">
                    {s.variant}: <strong className="text-[#FFFFFF] font-black">{((gate.winProbabilities?.[idx] ?? 0) * 100).toFixed(1)}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Failing Criteria Log */}
        {gate && gate.failingCriteria.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[#6C5636]/40 space-y-2">
            <div className="text-xs font-mono uppercase font-black text-[#C23B22] flex items-center gap-1.5">
              <SudarIcon name="vault" size={14} />
              <span>Unmet Criteria ({gate.failingCriteria.length}):</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono text-[#D6CFC4]/90 font-medium">
              {gate.failingCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pending Staged Rollout Banner */}
      {pending && (
        <div className="sudarkalam-frame p-5 rounded-2xl border-[#6C5636] bg-[#10140F]/90 text-[#FFFFFF] space-y-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono font-black text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6C5636] animate-ping" />
              <span className="text-[#FFFFFF]">STAGED ROLLOUT ACTIVE: {pending.variant.toUpperCase()}</span>
            </div>
            <span className="text-xs font-mono text-[#D6CFC4]/70 font-semibold">
              Expires: {new Date(pending.expires_at).toLocaleString()}
            </span>
          </div>

          <p className="text-xs text-[#D6CFC4]/80 leading-relaxed font-sans">
            Aria is currently serving 100% of traffic on <strong className="text-[#FFFFFF]">{pending.variant}</strong>.
            This rollout is time-limited to 24 hours. Confirm to make permanent, or cancel to auto-revert to equal split.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleAction('confirm')}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl bg-[#6C5636] hover:bg-[#856B44] text-[#FFFFFF] font-mono text-xs font-bold shadow-md transition-all border border-[#6C5636]"
            >
              Confirm Permanent Rollout
            </button>
            <button
              type="button"
              onClick={() => handleAction('cancel')}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl bg-[#2A0E0B] hover:bg-[#3D1410] border border-[#C23B22]/60 text-[#FFD6D0] font-mono text-xs font-bold transition-all"
            >
              Cancel &amp; Rollback
            </button>
          </div>
        </div>
      )}

      {/* Admin Action Console */}
      <div className="sudarkalam-frame p-6 rounded-2xl space-y-4 shadow-2xl">
        <h2 className="text-lg font-serif font-black text-[#FFFFFF] flex items-center gap-2.5">
          <SudarIcon name="vault" size={20} />
          <span>Human Governance Console</span>
        </h2>
        <p className="text-xs text-[#D6CFC4]/80 font-sans">
          Rollouts alter live Flagsmith multivariate feature weight allocation. Administrative authorization is strictly required.
        </p>

        {statusMessage && (
          <div className="p-3.5 rounded-xl bg-[#10140F] border border-[#6C5636] text-[#FFFFFF] text-xs font-mono font-bold flex items-center gap-2">
            <SudarIcon name="shield" size={14} />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-[#2A0E0B] border border-[#C23B22]/70 text-[#FFD6D0] text-xs font-mono font-bold flex items-center gap-2">
            <SudarIcon name="vault" size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Enter ADMIN_PASSWORD..."
            className="flex-1 rounded-xl border border-[#6C5636]/50 bg-[#090907] px-4 py-2.5 text-sm text-[#FFFFFF] placeholder:text-[#D6CFC4]/40 focus:outline-none focus:border-[#FFFFFF] font-mono shadow-inner"
          />

          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={actionLoading || !canShip || Boolean(pending)}
            className="px-6 py-2.5 rounded-xl bg-[#6C5636] hover:bg-[#856B44] disabled:bg-[#1C1813] disabled:text-[#D6CFC4]/30 text-[#FFFFFF] font-bold text-xs font-mono transition-all shadow-md flex items-center justify-center gap-2 border border-[#6C5636]"
          >
            {actionLoading ? 'Executing...' : 'Approve Staged Rollout (24h) →'}
          </button>
        </div>
      </div>

      {/* Post-Ship Attack Replay Verification */}
      <div className="sudarkalam-frame p-6 rounded-2xl space-y-4 shadow-2xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-serif font-black text-[#FFFFFF] flex items-center gap-2.5">
              <SudarIcon name="shield" size={20} />
              <span>Post-Ship Attack Replay Suite</span>
            </h2>
            <p className="text-xs text-[#D6CFC4]/80 mt-0.5 font-sans">
              Replay top 20 historical successful attacks against the candidate variant to verify real-world robustness.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={replayVariant}
              onChange={(e) => setReplayVariant(e.target.value as 'lurien' | 'control')}
              aria-label="Replay target variant"
              className="rounded-xl border border-[#6C5636]/60 bg-[#090907] px-3.5 py-2 text-xs font-mono text-[#FFFFFF] font-bold focus:outline-none focus:border-[#FFFFFF]"
            >
              <option value="lurien">lurien</option>
              <option value="control">control</option>
            </select>
            <button
              type="button"
              onClick={runReplay}
              disabled={replayLoading}
              className="px-4 py-2 rounded-xl border border-[#6C5636]/60 bg-[#13120E] hover:bg-[#6C5636]/40 disabled:opacity-50 text-[#FFFFFF] text-xs font-mono font-bold transition-all shadow-md flex items-center gap-2"
            >
              <SudarIcon name="talwars" size={14} />
              <span>{replayLoading ? 'Replaying...' : 'Run Replay Suite'}</span>
            </button>
          </div>
        </div>

        {replayError && (
          <div className="p-3.5 rounded-xl bg-[#2A0E0B] border border-[#C23B22]/70 text-[#FFD6D0] text-xs font-mono font-bold flex items-center gap-2">
            <SudarIcon name="vault" size={14} />
            <span>{replayError}</span>
          </div>
        )}

        {replayResult && (
          <div className="p-4 rounded-xl border border-[#6C5636]/40 bg-[#090907] font-mono text-xs space-y-2">
            {replayResult.empty ? (
              <div className="text-[#D6CFC4]/70 font-semibold">
                No breaches to replay yet &mdash; run the experiment to collect breach data
                {replayResult.reason ? ` (${replayResult.reason})` : ''}.
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-[#FFFFFF]">
                  [{replayResult.variant ?? replayVariant}] Replayed {replayResult.replayed} sessions &mdash;{' '}
                  {replayResult.rebreached} re-breached (
                  {replayResult.replayed > 0
                    ? ((replayResult.rebreached / replayResult.replayed) * 100).toFixed(1)
                    : '0.0'}
                  %)
                  {replayResult.errors > 0 && (
                    <span className="ml-2 text-[#C23B22]">&middot; {replayResult.errors} errors</span>
                  )}
                </span>
                <span
                  className={`px-3 py-1 rounded-md font-black text-xs ${
                    replayResult.replayed === 0
                      ? 'bg-[#231B0E] text-[#FFFFFF]'
                      : replayResult.rebreached / replayResult.replayed <= 0.15
                      ? 'bg-[#6C5636]/30 text-[#FFFFFF] border border-[#6C5636]'
                      : 'bg-[#2A0E0B] text-[#C23B22] border border-[#C23B22]/50'
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
