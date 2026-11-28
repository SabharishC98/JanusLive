'use client';

import React, { useState, useEffect } from 'react';
import { SudarIcon } from '@/components/SudarIcon';

interface BreachClaimFormProps {
  onClaimed?: (handle: string) => void;
}

export function BreachClaimForm({ onClaimed }: BreachClaimFormProps) {
  const [handle, setHandle] = useState('');
  const [contact, setContact] = useState('');
  const [claimedHandle, setClaimedHandle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check if identity already has a claimed handle
    fetch('/api/claim')
      .then((res) => res.json())
      .then((data) => {
        if (data?.claim?.handle) {
          setClaimedHandle(data.claim.handle);
          setHandle(data.claim.handle);
          if (data.claim.contact) setContact(data.claim.contact);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const trimmed = handle.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      setError('Handle must be 3 to 20 characters long.');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Handle can only contain letters, numbers, hyphens, and underscores.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: trimmed, contact: contact.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim handle');
      }

      setClaimedHandle(data.handle);
      setSuccess(true);
      if (onClaimed) onClaimed(data.handle);
    } catch (err: any) {
      setError(err.message || 'Error claiming handle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sudarkalam-frame p-5 rounded-2xl bg-[#110E0B]/95 border border-[#6C5636]/60 shadow-xl space-y-4">
      <div className="flex items-center gap-2.5 border-b border-[#6C5636]/40 pb-3">
        <span className="w-8 h-8 rounded-lg bg-[#6C5636]/25 border border-[#6C5636]/50 flex items-center justify-center text-[#FFFFFF]">
          <SudarIcon name="trophy" size={16} />
        </span>
        <div>
          <h3 className="font-serif font-black text-sm text-[#FFFFFF] tracking-wide">
            Claim Your Breacher Handle
          </h3>
          <p className="text-[11px] font-mono text-[#D6CFC4]/70">
            Immortalize your breach on the verified Hall of Breaches leaderboard.
          </p>
        </div>
      </div>

      {claimedHandle && !error && (
        <div className="p-3 rounded-xl bg-[#090907] border border-[#6C5636]/50 text-xs font-mono text-[#D6CFC4]/90 flex items-center justify-between">
          <span>
            Current Leaderboard Handle: <strong className="text-[#FFFFFF]">{claimedHandle}</strong>
          </span>
          <span className="text-[10px] text-[#6C5636] font-bold uppercase tracking-wider">Claimed</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
        <div>
          <label className="block text-[#D6CFC4]/80 font-bold mb-1">
            Handle (3-20 alphanumeric characters):
          </label>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={20}
            placeholder="e.g. CipherBreaker"
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090907] border border-[#6C5636]/50 text-[#FFFFFF] focus:outline-none focus:border-[#FFFFFF] transition-colors"
          />
        </div>

        <div>
          <label className="block text-[#D6CFC4]/80 font-bold mb-1">
            Optional Contact (Discord, X, or email &mdash; visible to research admins only):
          </label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={100}
            placeholder="e.g. @breacher_x / user#1234"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#090907] border border-[#6C5636]/50 text-[#FFFFFF] focus:outline-none focus:border-[#FFFFFF] transition-colors"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#2A0E0B] border border-[#C23B22]/60 text-[#FFD6D0] text-xs">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-[#1A2510] border border-[#4E7D28]/60 text-[#D2F5B0] text-xs">
            Handle claimed successfully! Your record on the Leaderboard is now linked to &quot;{claimedHandle}&quot;.
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-[#D6CFC4]/60 font-sans">
            Privacy: Handles are public. Contact info is strictly private to experiment stewards.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-[#6C5636] hover:bg-[#856B44] text-[#FFFFFF] font-bold text-xs transition-all shadow-md flex items-center gap-1.5 border border-[#6C5636]"
          >
            <SudarIcon name="talwars" size={12} />
            <span>{loading ? 'Saving...' : claimedHandle ? 'Update Handle' : 'Claim Handle'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
