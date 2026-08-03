'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import { Wallet, Coins, ArrowUpRight, ArrowDownLeft, ShieldCheck, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface Transaction {
  id: string;
  type: string;
  amount: string;
  status: string;
  description: string;
  createdAt: string;
}

interface Deposit {
  id: string;
  amount: string;
  txHash: string;
  status: string;
  createdAt: string;
}

interface Withdrawal {
  id: string;
  amount: string;
  address: string;
  status: string;
  createdAt: string;
}

export default function WalletPage() {
  const { user, token, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'tx' | 'deposits' | 'withdrawals'>('tx');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositHash, setDepositHash] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');

  const [txHistory, setTxHistory] = useState<Transaction[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [depSuccess, setDepSuccess] = useState<string | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [witSuccess, setWitSuccess] = useState<string | null>(null);
  const [witError, setWitError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetchHistory();
      // Generate a mock hash for deposit testing on load
      setDepositHash('0x' + Math.random().toString(16).substring(2, 10) + '...' + Math.random().toString(16).substring(2, 6));
    }
  }, [user, activeTab]);

  const fetchHistory = async () => {
    if (!token) return;
    try {
      setLoadingHistory(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      
      const [txRes, depRes, witRes] = await Promise.all([
        fetch(`${API_URL}/wallet/transactions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/wallet/deposits`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/wallet/withdrawals`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (txRes.ok && depRes.ok && witRes.ok) {
        const txData = await txRes.json();
        const depData = await depRes.json();
        const witData = await witRes.json();

        setTxHistory(txData.transactions);
        setDeposits(depData.deposits);
        setWithdrawals(witData.withdrawals);
      }
    } catch (err) {
      console.error('Failed to fetch wallet logs:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepError(null);
    setDepSuccess(null);

    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setDepError('Please enter a valid positive amount');
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: amountNum, txHash: depositHash }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDepError(data.error || 'Failed to submit deposit');
      } else {
        setDepSuccess('Deposit submitted successfully! Pending Admin approval.');
        setDepositAmount('');
        // Regenerate next random mock hash
        setDepositHash('0x' + Math.random().toString(16).substring(2, 10) + '...' + Math.random().toString(16).substring(2, 6));
        fetchHistory();
        refreshProfile();
      }
    } catch (err: any) {
      setDepError(err.message || 'Server error');
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setWitError(null);
    setWitSuccess(null);

    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setWitError('Please enter a valid positive amount');
      return;
    }

    if (amountNum > parseFloat(user?.wallet?.balance || '0.00')) {
      setWitError('Insufficient balance');
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: amountNum, address: withdrawAddress }),
      });

      const data = await res.json();
      if (!res.ok) {
        setWitError(data.error || 'Failed to submit withdrawal');
      } else {
        setWitSuccess('Withdrawal requested! Balance locked. Pending Admin approval.');
        setWithdrawAmount('');
        setWithdrawAddress('');
        fetchHistory();
        refreshProfile();
      }
    } catch (err: any) {
      setWitError(err.message || 'Server error');
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#03000a] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const renderStatus = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={12} /> Approved</span>;
      case 'PENDING':
        return <span className="flex items-center gap-1 text-amber-400"><Clock size={12} /> Pending</span>;
      case 'REJECTED':
        return <span className="flex items-center gap-1 text-red-400"><XCircle size={12} /> Rejected</span>;
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-[#03000a] flex flex-col pb-12">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 mt-8 w-full flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Forms column */}
        <div className="space-y-8 lg:col-span-1">
          
          {/* Deposit Widget */}
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/10 space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <ArrowUpRight size={18} className="text-cyan-400" />
              Deposit Funds
            </h2>
            
            {depError && <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-semibold rounded-xl">{depError}</div>}
            {depSuccess && <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl">{depSuccess}</div>}

            <form onSubmit={handleDeposit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="10.00"
                  className="w-full px-4 py-3 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-sm outline-none text-zinc-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">TX Hash (Mock Crypto Ledger)</label>
                <input
                  type="text"
                  required
                  value={depositHash}
                  onChange={(e) => setDepositHash(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-950 border border-white/5 focus:border-cyan-500/50 rounded-2xl text-xs font-mono outline-none text-zinc-300"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all"
              >
                Submit Deposit
              </button>
            </form>
          </div>

          {/* Withdraw Widget */}
          <div className="glass-panel p-6 rounded-3xl border border-purple-500/10 space-y-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <ArrowDownLeft size={18} className="text-fuchsia-400" />
              Withdraw Funds
            </h2>

            {witError && <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-400 text-xs font-semibold rounded-xl">{witError}</div>}
            {witSuccess && <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-xl">{witSuccess}</div>}

            <form onSubmit={handleWithdrawal} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="50.00"
                  className="w-full px-4 py-3 bg-zinc-950 border border-white/5 focus:border-fuchsia-500/50 rounded-2xl text-sm outline-none text-zinc-200"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">Wallet Address (Crypto / USD Address)</label>
                <input
                  type="text"
                  required
                  value={withdrawAddress}
                  onChange={(e) => setWithdrawAddress(e.target.value)}
                  placeholder="e.g. 0x71C...B49"
                  className="w-full px-4 py-3 bg-zinc-950 border border-white/5 focus:border-fuchsia-500/50 rounded-2xl text-xs font-mono outline-none text-zinc-300"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(217,70,239,0.2)] transition-all"
              >
                Submit Withdrawal
              </button>
            </form>
          </div>
        </div>

        {/* Ledger column */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl border border-white/5 flex flex-col">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
            <div className="flex gap-2">
              {[
                { id: 'tx', name: 'General Ledger' },
                { id: 'deposits', name: 'Deposits History' },
                { id: 'withdrawals', name: 'Withdrawals History' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                    activeTab === tab.id
                      ? 'bg-purple-950/40 text-purple-400 border border-purple-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
            
            <button
              onClick={fetchHistory}
              className="p-2 bg-zinc-950 border border-white/5 hover:border-purple-500/20 rounded-xl text-zinc-400"
            >
              <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Tab lists */}
          <div className="flex-grow overflow-x-auto min-h-[400px]">
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center min-h-[400px]">
                <div className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
              </div>
            ) : activeTab === 'tx' ? (
              txHistory.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-semibold">No general transactions found.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5 pb-2">
                      <th className="py-2.5">Type</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                    {txHistory.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/1">
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full font-black text-[9px] ${
                            tx.type.includes('WIN') || tx.type.includes('DEPOSIT') || tx.type.includes('BONUS')
                              ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400'
                              : 'bg-rose-950/40 border border-rose-500/20 text-rose-400'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td>{tx.description}</td>
                        <td className={`font-black text-sm tracking-wider ${
                          parseFloat(tx.amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {parseFloat(tx.amount) >= 0 ? '+' : ''}${parseFloat(tx.amount).toFixed(2)}
                        </td>
                        <td className="text-zinc-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : activeTab === 'deposits' ? (
              deposits.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-semibold">No deposit submissions found.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5 pb-2">
                      <th className="py-2.5">Amount</th>
                      <th>TX Ledger Hash</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                    {deposits.map((dep) => (
                      <tr key={dep.id} className="hover:bg-white/1">
                        <td className="py-3 font-black text-cyan-400">${parseFloat(dep.amount).toFixed(2)}</td>
                        <td className="font-mono text-zinc-400 text-[10px]">{dep.txHash}</td>
                        <td>{renderStatus(dep.status)}</td>
                        <td className="text-zinc-500">{new Date(dep.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              withdrawals.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-semibold">No withdrawal requests found.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-white/5 pb-2">
                      <th className="py-2.5">Amount</th>
                      <th>Destination Address</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-semibold text-zinc-300">
                    {withdrawals.map((wit) => (
                      <tr key={wit.id} className="hover:bg-white/1">
                        <td className="py-3 font-black text-rose-400">${parseFloat(wit.amount).toFixed(2)}</td>
                        <td className="font-mono text-zinc-400 text-[10px]">{wit.address}</td>
                        <td>{renderStatus(wit.status)}</td>
                        <td className="text-zinc-500">{new Date(wit.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
