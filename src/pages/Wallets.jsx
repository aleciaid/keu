import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { formatIDR, formatDate } from '../utils/currency';
import { sendWebhook } from '../utils/webhook';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import AmountInput from '../components/AmountInput';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  Wallet as WalletIcon,
} from 'lucide-react';

const WALLET_ICONS = ['💳', '💰', '🏦', '📱', '💵', '🪙', '💎', '🏧'];
const WALLET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#10b981', '#14b8a6', '#3b82f6', '#06b6d4',
];

export default function Wallets({ openModal, onModalStateChange }) {
  const wallets = useLiveQuery(() => db.wallets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editWallet, setEditWallet] = useState(null);

  useEffect(() => {
    if (openModal) {
      openCreate();
      if (onModalStateChange) onModalStateChange(false);
    }
  }, [openModal, onModalStateChange]);
  const [deleteId, setDeleteId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    initialBalance: 0,
    icon: '💳',
    color: '#6366f1',
  });

  // Calculate wallet balances
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

  const openCreate = () => {
    setEditWallet(null);
    setForm({ name: '', initialBalance: 0, icon: '💳', color: '#6366f1' });
    setModalOpen(true);
  };

  const openEdit = (wallet) => {
    setEditWallet(wallet);
    setForm({
      name: wallet.name,
      initialBalance: wallet.initialBalance,
      icon: wallet.icon || '💳',
      color: wallet.color || '#6366f1',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nama wallet harus diisi');
      return;
    }

    const now = new Date().toISOString();

    if (editWallet) {
      await db.wallets.update(editWallet.id, {
        name: form.name.trim(),
        initialBalance: form.initialBalance,
        icon: form.icon,
        color: form.color,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'wallet_updated',
        details: { walletId: editWallet.id, name: form.name },
        createdAt: now,
      });

      sendWebhook('wallet_updated', {
        id: editWallet.id,
        name: form.name,
        balance: walletBalances[editWallet.id] || 0,
      });

      toast.success('Wallet berhasil diupdate');
    } else {
      const id = crypto.randomUUID();
      await db.wallets.add({
        id,
        name: form.name.trim(),
        initialBalance: form.initialBalance,
        icon: form.icon,
        color: form.color,
        createdAt: now,
        updatedAt: now,
      });

      await db.logs.add({
        id: crypto.randomUUID(),
        action: 'wallet_created',
        details: { walletId: id, name: form.name },
        createdAt: now,
      });

      sendWebhook('wallet_created', {
        id,
        name: form.name,
        initialBalance: form.initialBalance,
      });

      toast.success('Wallet berhasil dibuat');
    }

    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // Check if wallet has transactions
    const txCount = await db.transactions
      .where('walletId').equals(deleteId)
      .or('fromWalletId').equals(deleteId)
      .or('toWalletId').equals(deleteId)
      .count();

    if (txCount > 0) {
      toast.error(`Wallet masih memiliki ${txCount} transaksi. Hapus transaksi terlebih dahulu.`);
      setDeleteId(null);
      return;
    }

    await db.wallets.delete(deleteId);
    await db.logs.add({
      id: crypto.randomUUID(),
      action: 'wallet_deleted',
      details: { walletId: deleteId },
      createdAt: new Date().toISOString(),
    });

    toast.success('Wallet berhasil dihapus');
    setDeleteId(null);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <p className="text-sm text-surface-400 mb-1">💳 Kelola</p>
          <h1 className="page-title">Wallets</h1>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus size={14} /> Baru
        </button>
      </div>

      {/* Total Balance Card */}
      <div className="card bg-gradient-to-br from-primary-600/20 to-purple-600/20 border-primary-500/20 mb-6">
        <p className="text-xs text-surface-400 mb-1">Total Balance</p>
        <p className={`text-2xl font-bold ${totalBalance < 0 ? 'text-red-400' : 'text-white'}`}>
          {formatIDR(totalBalance)}
        </p>
        <p className="text-xs text-surface-500 mt-1">{wallets.length} wallet aktif</p>
      </div>

      {/* Wallet List */}
      {wallets.length === 0 ? (
        <div className="empty-state">
          <WalletIcon size={40} className="mb-3 text-surface-600" />
          <p className="text-base font-medium mb-1">Belum ada wallet</p>
          <p className="text-sm text-surface-600 mb-4">Buat wallet pertama Anda untuk mulai tracking</p>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> Buat Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((wallet) => {
            const balance = walletBalances[wallet.id] || 0;
            return (
              <div
                key={wallet.id}
                className="card group hover:border-primary-500/30 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: (wallet.color || '#6366f1') + '20' }}
                  >
                    {wallet.icon || '💳'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-white">{wallet.name}</h4>
                    <p className={`text-lg font-bold ${balance < 0 ? 'text-red-400' : 'text-white'}`}>
                      {formatIDR(balance)}
                    </p>
                    <p className="text-[10px] text-surface-500">
                      Saldo awal: {formatIDR(wallet.initialBalance)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(wallet)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(wallet.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-red-500/20 text-surface-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editWallet ? 'Edit Wallet' : 'Buat Wallet Baru'}
        footer={
          <div className="flex gap-3">
            <button onClick={() => setModalOpen(false)} className="btn-ghost flex-1">Batal</button>
            <button onClick={handleSave} className="btn-primary flex-1">
              {editWallet ? 'Update' : 'Simpan'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="input-group">
            <label className="input-label">Nama Wallet</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="cth: Cash, BCA, Dana"
              className="w-full"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Saldo Awal</label>
            <AmountInput
              value={form.initialBalance}
              onChange={(v) => setForm({ ...form, initialBalance: v })}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Icon</label>
            <div className="flex flex-wrap gap-2">
              {WALLET_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setForm({ ...form, icon })}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${form.icon === icon
                      ? 'bg-primary-500/20 border-2 border-primary-500 scale-110'
                      : 'bg-surface-800 hover:bg-surface-700'
                    }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Warna</label>
            <div className="flex flex-wrap gap-2">
              {WALLET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900 scale-110' : 'hover:scale-105'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Wallet?"
        message="Wallet yang dihapus tidak dapat dikembalikan. Pastikan tidak ada transaksi yang terkait."
      />
    </div>
  );
}
