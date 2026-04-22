import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import {
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Wallet,
  DollarSign,
  ChevronRight,
} from 'lucide-react';

export default function Dashboard({ onNavigate }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  // Calculate totals
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Compute wallet balances
  const walletBalances = {};
  wallets.forEach((w) => {
    walletBalances[w.id] = w.initialBalance || 0;
  });

  transactions.forEach((t) => {
    if (t.type === 'income') {
      walletBalances[t.walletId] = (walletBalances[t.walletId] || 0) + t.amount;
    } else if (t.type === 'expense') {
      walletBalances[t.walletId] = (walletBalances[t.walletId] || 0) - t.amount;
    } else if (t.type === 'transfer') {
      walletBalances[t.fromWalletId] = (walletBalances[t.fromWalletId] || 0) - t.amount;
      walletBalances[t.toWalletId] = (walletBalances[t.toWalletId] || 0) + t.amount;
    }
  });

  const totalBalance = Object.values(walletBalances).reduce((a, b) => a + b, 0);

  // Monthly summary
  const monthlyTx = transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);
  const monthlyIncome = monthlyTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const monthlyExpense = monthlyTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const netBalance = monthlyIncome - monthlyExpense;

  // Last 5 transactions
  const recentTx = transactions.slice(0, 5);

  // Category map
  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  // Wallet map
  const walletMap = {};
  wallets.forEach((w) => { walletMap[w.id] = w; });

  const summaryCards = [
    {
      label: 'Total Balance',
      value: totalBalance,
      icon: Wallet,
      gradient: 'from-indigo-600 to-purple-600',
      iconBg: 'bg-indigo-500/20',
      textColor: totalBalance < 0 ? 'text-red-400' : 'text-white',
    },
    {
      label: 'Income Bulan Ini',
      value: monthlyIncome,
      icon: TrendingUp,
      gradient: 'from-emerald-600 to-teal-600',
      iconBg: 'bg-emerald-500/20',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Expense Bulan Ini',
      value: monthlyExpense,
      icon: TrendingDown,
      gradient: 'from-red-600 to-rose-600',
      iconBg: 'bg-red-500/20',
      textColor: 'text-red-400',
    },
    {
      label: 'Net Balance',
      value: netBalance,
      icon: DollarSign,
      gradient: netBalance >= 0 ? 'from-blue-600 to-cyan-600' : 'from-orange-600 to-red-600',
      iconBg: netBalance >= 0 ? 'bg-blue-500/20' : 'bg-orange-500/20',
      textColor: netBalance >= 0 ? 'text-blue-400' : 'text-red-400',
    },
  ];

  const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">📊 Overview</p>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-surface-500">{monthName}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="stat-card group hover:border-primary-500/30">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon size={18} className={card.textColor} />
                </div>
              </div>
              <p className="text-[11px] text-surface-400 font-medium mb-1">{card.label}</p>
              <p className={`text-base font-bold ${card.textColor} truncate`}>
                {formatCompactIDR(card.value)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Wallet Distribution */}
      {wallets.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Wallet Distribution</h3>
            <button
              onClick={() => onNavigate('wallets')}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              Lihat semua <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {wallets.map((wallet) => {
              const balance = walletBalances[wallet.id] || 0;
              const pct = totalBalance > 0 ? Math.max(0, (balance / totalBalance) * 100) : 0;
              return (
                <div key={wallet.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: wallet.color || '#6366f1' }}
                      />
                      <span className="text-xs font-medium text-surface-300">
                        {wallet.icon || '💳'} {wallet.name}
                      </span>
                    </div>
                    <span className={`text-xs font-bold ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
                      {formatCompactIDR(balance)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: wallet.color || '#6366f1',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Transaksi Terakhir</h3>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
          >
            Lihat semua <ChevronRight size={12} />
          </button>
        </div>

        {recentTx.length === 0 ? (
          <div className="empty-state py-8">
            <ArrowLeftRight size={32} className="mb-2 text-surface-600" />
            <p className="text-sm">Belum ada transaksi</p>
            <p className="text-xs text-surface-600 mt-1">Tambahkan transaksi pertama Anda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTx.map((tx) => {
              const cat = catMap[tx.categoryId];
              const wallet = walletMap[tx.walletId] || walletMap[tx.fromWalletId];
              const toWallet = walletMap[tx.toWalletId];

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-colors"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: (cat?.color || '#6366f1') + '20' }}
                  >
                    {tx.type === 'transfer' ? '↔️' : (cat?.icon || '📦')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {tx.type === 'transfer'
                        ? `${wallet?.name || '?'} → ${toWallet?.name || '?'}`
                        : (cat?.name || 'Lainnya')}
                    </p>
                    <p className="text-[11px] text-surface-500 truncate">
                      {tx.note || (wallet?.name || '')} • {formatDate(tx.date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-bold ${
                        tx.type === 'income'
                          ? 'text-emerald-400'
                          : tx.type === 'expense'
                          ? 'text-red-400'
                          : 'text-blue-400'
                      }`}
                    >
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatIDR(tx.amount, false)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
