import Dexie from 'dexie';

export const db = new Dexie('FinanceTracker');

db.version(2).stores({
  wallets: 'id, name, createdAt, updatedAt',
  transactions: 'id, type, walletId, fromWalletId, toWalletId, categoryId, date, amount, createdAt, updatedAt',
  categories: 'id, name, type, createdAt, updatedAt',
  logs: 'id, action, createdAt',
  settings: 'key',
  deviceInfo: 'key',
});

// Seed default categories
export const DEFAULT_CATEGORIES = [
  // Income
  { id: 'cat-income-gaji', name: 'Gaji', type: 'income', icon: '💰', color: '#10b981', isDefault: true },
  { id: 'cat-income-bonus', name: 'Bonus', type: 'income', icon: '🎁', color: '#f59e0b', isDefault: true },
  { id: 'cat-income-investasi', name: 'Investasi', type: 'income', icon: '📈', color: '#3b82f6', isDefault: true },
  { id: 'cat-income-lainnya', name: 'Lainnya', type: 'income', icon: '📥', color: '#8b5cf6', isDefault: true },
  // Expense
  { id: 'cat-expense-makan', name: 'Makan', type: 'expense', icon: '🍕', color: '#ef4444', isDefault: true },
  { id: 'cat-expense-transport', name: 'Transport', type: 'expense', icon: '🚗', color: '#f97316', isDefault: true },
  { id: 'cat-expense-tagihan', name: 'Tagihan', type: 'expense', icon: '📄', color: '#eab308', isDefault: true },
  { id: 'cat-expense-belanja', name: 'Belanja', type: 'expense', icon: '🛍️', color: '#ec4899', isDefault: true },
  { id: 'cat-expense-hiburan', name: 'Hiburan', type: 'expense', icon: '🎬', color: '#a855f7', isDefault: true },
  { id: 'cat-expense-kesehatan', name: 'Kesehatan', type: 'expense', icon: '🏥', color: '#14b8a6', isDefault: true },
  { id: 'cat-expense-pendidikan', name: 'Pendidikan', type: 'expense', icon: '📚', color: '#6366f1', isDefault: true },
  { id: 'cat-expense-lainnya', name: 'Lainnya', type: 'expense', icon: '📦', color: '#64748b', isDefault: true },
];

// Generate or retrieve device UUID
export async function getDeviceUUID() {
  const existingUUID = await db.deviceInfo.get('deviceUUID');
  if (existingUUID) {
    return existingUUID.value;
  }

  // Generate a new UUID if not exists
  const newUUID = crypto.randomUUID();
  await db.deviceInfo.put({ key: 'deviceUUID', value: newUUID });
  return newUUID;
}

export async function seedDatabase() {
  const count = await db.categories.count();
  if (count === 0) {
    const now = new Date().toISOString();
    await db.categories.bulkAdd(
      DEFAULT_CATEGORIES.map(c => ({
        ...c,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  // Seed default settings
  const webhookUrl = await db.settings.get('webhookUrl');
  if (!webhookUrl) {
    await db.settings.bulkPut([
      { key: 'webhookUrl', value: '' },
      { key: 'webhookEnabled', value: false },
      { key: 'appVersion', value: '1.0.0' },
    ]);
  }

  // Ensure device UUID is generated
  await getDeviceUUID();
}
