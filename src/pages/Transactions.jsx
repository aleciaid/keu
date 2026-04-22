import { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate, formatCompactIDR } from '../utils/currency';
import { sendWebhook } from '../utils/webhook';
import { calculateWalletBalances, calculateNetBalance, getAvailableBalanceForSpending } from '../utils/calculations';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AmountInput from '../components/AmountInput';
import toast from 'react-hot-toast';
import {
  Plus,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Pencil,
  Trash2,
  X,
  Calendar,
  ChevronDown,
} from 'lucide-react';

export default function Transactions({ openModal, onModalStateChange }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];

  const [modalOpen, setModalOpen] = useState(false);

  // Handle external modal open trigger
  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal]);
  const [editTx, setEditTx] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterWallet, setFilterWallet] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Form state
  const [txType, setTxType] = useState('expense');
  const [form, setForm] = useState({
    amount: 0,
    categoryId: '',
    walletId: '',
    fromWalletId: '',
    toWalletId: '',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  // Category/Wallet maps
  const catMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id] = c; });
    return m;
  }, [categories]);

  const walletMap = useMemo(() => {
    const m = {};
    wallets.forEach((w) => { m[w.id] = w; });
    return m;
  }, [wallets]);

  // Calculate wallet balances for transfer validation
  const walletBalances = useMemo(() => {
    const balances = {};
    wallets.forEach((w) => { balances[w.id] = w.initialBalance || 0; });
    transactions.forEach((t) => {
      if (t.type === 'income') balances[t.walletId] = (balances[t.walletId] || 0) + t.amount;
      else if (t.type === 'expense') balances[t.walletId] = (balances[t.walletId] || 0) - t.amount;
      else if (t.type === 'transfer') {
        balances[t.fromWalletId] = (balances[t.fromWalletId] || 0) - t.amount;
        balances[t.toWalletId] = (balances[t.toWalletId] || 0) + t.amount;
      }
    });
    return balances;
  }, [wallets, transactions]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType && tx.type !== filterType) return false;
      if (filterWallet) {
        if (tx.walletId !== filterWallet && tx.fromWalletId !== filterWallet && tx.toWalletId !== filterWallet) return false;
      }
      if (filterCategory && tx.categoryId !== filterCategory) return false;
      if (filterDateFrom && tx.date < filterDateFrom) return false;
      if (filterDateTo && tx.date > filterDateTo + 'T23:59:59') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const cat = catMap[tx.categoryId];
        const wallet = walletMap[tx.walletId] || walletMap[tx.fromWalletId];
        const match = (
          (tx.note || '').toLowerCase().includes(q) ||
          String(tx.amount).includes(q) ||
          (cat?.name || '').toLowerCase().includes(q) ||
          (wallet?.name || '').toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterWallet, filterCategory, filterDateFrom, filterDateTo, searchQuery, catMap, walletMap]);

  const hasActiveFilters = filterType || filterWallet || filterCategory || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterType('');
    setFilterWallet('');
    setFilterCategory('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  const openCreate = (type = 'expense') => {
    setEditTx(null);
    setTxType(type);
    setForm({
      amount: 0,
      categoryId: '',
      walletId: wallets[0]?.id || '',
      fromWalletId: wallets[0]?.id || '',
      toWalletId: wallets[1]?.id || '',
      date: new Date().toISOString().slice(0, 10),
      note: '',
    });
    setModalOpen(true);
  };

  const openEdit = (tx) => {
    setEditTx(tx);
    setTxType(tx.type);
    setForm({
      amount: tx.amount,
      categoryId: tx.categoryId || '',
      walletId: tx.walletId || '',
      fromWalletId: tx.fromWalletId || '',
      toWalletId: tx.toWalletId || '',
      date: (tx.date || '').slice(0, 10),
      note: tx.note || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (form.amount <= 0) {
      toast.error('Jumlah harus lebih dari 0');
      return;
    }

    if (txType === 'transfer') {
      if (!form.fromWalletId || !form.toWalletId) {
        toast.error('Pilih wallet asal dan tujuan');
        return;
      }
      if (form.fromWalletId === form.toWalletId) {
        toast.error('Wallet asal dan tujuan tidak boleh sama');
        return;
      }
      // Check balance for transfer (only for new transactions or if amount changed)
      if (!editTx || editTx.amount !== form.amount || editTx.fromWalletId !== form.fromWalletId) {
        const fromBalance = walletBalances[form.fromWalletId] || 0;
        // If editing, add back the old amount
        const availableBalance = editTx && editTx.fromWalletId === form.fromWalletId
          ? fromBalance + editTx.amount
          : fromBalance;
        if (form.amount > availableBalance) {
          toast.error(`Saldo tidak cukup. Tersedia: ${formatIDR(availableBalance)}`);
          return;
        }
      }
    } else if (txType === 'expense') {
      if (!form.walletId) {
        toast.error('Pilih wallet');
        return;
      }
      if (!form.categoryId) {
        toast.error('Pilih kategori');
        return;
      }
      
      // Check if expense exceeds available balance for the wallet
      const walletBalance = walletBalances[form.walletId] || 0;
      const availableForExpense = editTx && editTx.walletId === form.walletId 
        ? walletBalance + editTx.amount 
        : walletBalance;
      
      if (form.amount > availableForExpense) {
        toast.error(`Saldo wallet tidak cukup. Tersedia: ${formatCompactIDR(availableForExpense)}`);
        return;
      }
    } else if (txType === 'income') {
      if (!form.walletId) {
        toast.error('Pilih wallet');
        return;
      }
      if (!form.categoryId) {
        toast.error('Pilih kategori');
        return;
      }
    }

    const now = new Date().toISOString();
    const dateValue = form.date ? new Date(form.date).toISOString() : now;

    if (editTx) {
      const updateData = {
        type: txType,
        amount: form.amount,
        date: dateValue,
        note: form.note,
        updatedAt: now,
      };

      if (txType === 'transfer') {
        updateData.fromWalletId = form.fromWalletId;
        updateData.toWalletId = form.toWalletId;
        updateData.walletId = '';
        updateData.categoryId = '';
      } else {
        updateData.walletId = form.walletId;
        updateData.categoryId = form.categoryId;
        updateData.fromWalletId = '';
        updateData.toWalletId = '';
      }

      await db.transactions.update(editTx.id, updateData);

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'transaction_updated',
        details: { transactionId: editTx.id, type: txType },
        createdAt: now,
      });

      toast.success('Transaksi berhasil diupdate');
    } else {
      const id = crypto.randomUUID();
      const txData = {
        id,
        type: txType,
        amount: form.amount,
        date: dateValue,
        note: form.note,
        createdAt: now,
        updatedAt: now,
      };

      if (txType === 'transfer') {
        txData.fromWalletId = form.fromWalletId;
        txData.toWalletId = form.toWalletId;
        txData.walletId = '';
        txData.categoryId = '';
      } else {
        txData.walletId = form.walletId;
        txData.categoryId = form.categoryId;
        txData.fromWalletId = '';
        txData.toWalletId = '';
      }

      await db.transactions.add(txData);

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'transaction_created',
        details: { transactionId: id, type: txType, amount: form.amount },
        createdAt: now,
      });

      // Send webhook
      const wallet = walletMap[form.walletId] || walletMap[form.fromWalletId];
      const cat = catMap[form.categoryId];
      sendWebhook(txType === 'transfer' ? 'transfer_created' : 'transaction_created', {
        id,
        type: txType,
        amount: form.amount,
        wallet: wallet?.name || '',
        category: cat?.name || '',
        note: form.note,
        date: dateValue,
      });

      toast.success('Transaksi berhasil ditambahkan');
    }

    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await db.transactions.delete(deleteId);
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'transaction_deleted',
      details: { transactionId: deleteId },
      createdAt: new Date().toISOString(),
    });
    toast.success('Transaksi berhasil dihapus');
    setDeleteId(null);
  };

  const filteredCategories = categories.filter((c) => c.type === txType);

  const typeButtons = [
    { type: 'expense', label: 'Expense', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30' },
    { type: 'income', label: 'Income', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
    { type: 'transfer', label: 'Transfer', icon: ArrowLeftRight, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30' },
  ];

  // Group transactions by date
  const groupedTx = useMemo(() => {
    const groups = {};
    filtered.forEach((tx) => {
      const dateKey = (tx.date || '').slice(0, 10);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">📊 Semua</p>
          <h1 className="page-title">Transaksi</h1>
        </div>
        <button onClick={() => openCreate()} className="btn-primary btn-sm">
          <Plus size={14} /> Baru
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari transaksi..."
            className="w-full pl-9 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={`btn-ghost btn-sm relative ${hasActiveFilters ? 'border-primary-500/50 text-primary-400' : ''}`}
        >
          <Filter size={14} />
          {hasActiveFilters && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className="card mb-4 animate-scaleIn">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Filter</h4>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-primary-400 hover:text-primary-300">
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="input-group">
              <label className="input-label">Tipe</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full text-sm py-2">
                <option value="">Semua</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Wallet</label>
              <select value={filterWallet} onChange={(e) => setFilterWallet(e.target.value)} className="w-full text-sm py-2">
                <option value="">Semua</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Dari Tanggal</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-full text-sm py-2" />
            </div>
            <div className="input-group">
              <label className="input-label">Sampai Tanggal</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-full text-sm py-2" />
            </div>
            <div className="input-group col-span-2">
              <label className="input-label">Kategori</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full text-sm py-2">
                <option value="">Semua</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ArrowLeftRight size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">
            {hasActiveFilters || searchQuery ? 'Tidak ditemukan' : 'Belum ada transaksi'}
          </p>
          <p className="text-sm text-surface-600">
            {hasActiveFilters || searchQuery ? 'Coba ubah filter pencarian' : 'Tap + untuk menambah transaksi'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedTx.map(([dateKey, txList]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={12} className="text-surface-500" />
                <span className="text-xs font-medium text-surface-500">
                  {formatDate(dateKey)}
                </span>
                <div className="flex-1 h-px bg-surface-800" />
              </div>
              <div className="space-y-2">
                {txList.map((tx) => {
                  const cat = catMap[tx.categoryId];
                  const wallet = walletMap[tx.walletId] || walletMap[tx.fromWalletId];
                  const toWallet = walletMap[tx.toWalletId];

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface-800/50 hover:bg-surface-800 transition-colors group"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: (cat?.color || '#6366f1') + '20' }}
                      >
                        {tx.type === 'transfer' ? '↔️' : (cat?.icon || '📦')}
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => openEdit(tx)}>
                        <p className="text-sm font-medium text-white truncate">
                          {tx.type === 'transfer'
                            ? `${wallet?.name || '?'} → ${toWallet?.name || '?'}`
                            : (cat?.name || 'Lainnya')}
                        </p>
                        <p className="text-[11px] text-surface-500 truncate">
                          {tx.note || (wallet?.name || '')}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
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
                        <button
                          onClick={() => setDeleteId(tx.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTx ? 'Edit Transaksi' : 'Transaksi Baru'}
      >
        <div className="space-y-4">
          {/* Type Selector */}
          <div className="flex gap-2">
            {typeButtons.map((tb) => {
              const Icon = tb.icon;
              return (
                <button
                  key={tb.type}
                  onClick={() => setTxType(tb.type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    txType === tb.type ? `${tb.bg} ${tb.color}` : 'bg-surface-800/50 border-surface-700/50 text-surface-400'
                  }`}
                >
                  <Icon size={14} />
                  {tb.label}
                </button>
              );
            })}
          </div>

          {/* Amount */}
          <div className="input-group">
            <label className="input-label">Jumlah</label>
            <AmountInput
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
            />
          </div>

          {/* Conditional fields based on type */}
          {txType === 'transfer' ? (
            <>
              <div className="input-group">
                <label className="input-label">Dari Wallet</label>
                <select
                  value={form.fromWalletId}
                  onChange={(e) => setForm({ ...form, fromWalletId: e.target.value })}
                  className="w-full"
                >
                  <option value="">Pilih wallet asal</option>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name} ({formatIDR(walletBalances[w.id] || 0)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Ke Wallet</label>
                <select
                  value={form.toWalletId}
                  onChange={(e) => setForm({ ...form, toWalletId: e.target.value })}
                  className="w-full"
                >
                  <option value="">Pilih wallet tujuan</option>
                  {wallets.filter((w) => w.id !== form.fromWalletId).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name} ({formatIDR(walletBalances[w.id] || 0)})
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="input-group">
                <label className="input-label">Wallet</label>
                <select
                  value={form.walletId}
                  onChange={(e) => setForm({ ...form, walletId: e.target.value })}
                  className="w-full"
                >
                  <option value="">Pilih wallet</option>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Kategori</label>
                <div className="grid grid-cols-4 gap-2">
                  {filteredCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setForm({ ...form, categoryId: cat.id })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl text-center transition-all ${
                        form.categoryId === cat.id
                          ? 'bg-primary-500/20 border border-primary-500/50'
                          : 'bg-surface-800/50 border border-transparent hover:bg-surface-700/50'
                      }`}
                    >
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-[10px] text-surface-300 leading-tight">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Date */}
          <div className="input-group">
            <label className="input-label">Tanggal</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full"
            />
          </div>

          {/* Note */}
          <div className="input-group">
            <label className="input-label">Catatan (opsional)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Tambah catatan..."
              className="w-full"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editTx ? 'Update' : 'Simpan'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Transaksi?"
        message="Transaksi yang dihapus tidak dapat dikembalikan."
      />
    </div>
  );
}
