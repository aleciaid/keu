import { db } from '../db/database';

const APP_VERSION = '1.0.0';

/**
 * Export all data to JSON
 */
export async function exportData() {
  const wallets = await db.wallets.toArray();
  const transactions = await db.transactions.toArray();
  const categories = await db.categories.toArray();
  const logs = await db.logs.toArray();
  const settings = await db.settings.toArray();

  const data = {
    metadata: {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      recordCount: {
        wallets: wallets.length,
        transactions: transactions.length,
        categories: categories.length,
        logs: logs.length,
      },
    },
    wallets,
    transactions,
    categories,
    logs,
    settings,
  };

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `finance-backup-${dateStr}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  return { filename, size: blob.size };
}

/**
 * Validate import data structure
 */
export function validateImportData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid data format');
    return { valid: false, errors };
  }

  if (!data.metadata) {
    errors.push('Missing metadata');
  }

  const requiredTables = ['wallets', 'transactions', 'categories'];
  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      errors.push(`Missing or invalid "${table}" data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    preview: errors.length === 0 ? {
      version: data.metadata?.version || 'unknown',
      exportedAt: data.metadata?.exportedAt || 'unknown',
      counts: data.metadata?.recordCount || {
        wallets: data.wallets?.length || 0,
        transactions: data.transactions?.length || 0,
        categories: data.categories?.length || 0,
        logs: data.logs?.length || 0,
      },
    } : null,
  };
}

/**
 * Import data with mode: 'replace' or 'merge'
 */
export async function importData(data, mode = 'replace') {
  if (mode === 'replace') {
    // Clear all tables
    await db.wallets.clear();
    await db.transactions.clear();
    await db.categories.clear();
    await db.logs.clear();

    // Import all data
    if (data.wallets?.length) await db.wallets.bulkAdd(data.wallets);
    if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions);
    if (data.categories?.length) await db.categories.bulkAdd(data.categories);
    if (data.logs?.length) await db.logs.bulkAdd(data.logs);
    if (data.settings?.length) {
      for (const s of data.settings) {
        await db.settings.put(s);
      }
    }
  } else {
    // Merge mode: skip duplicates by UUID
    if (data.wallets?.length) {
      for (const w of data.wallets) {
        const exists = await db.wallets.get(w.id);
        if (!exists) await db.wallets.add(w);
      }
    }
    if (data.transactions?.length) {
      for (const t of data.transactions) {
        const exists = await db.transactions.get(t.id);
        if (!exists) await db.transactions.add(t);
      }
    }
    if (data.categories?.length) {
      for (const c of data.categories) {
        const exists = await db.categories.get(c.id);
        if (!exists) await db.categories.add(c);
      }
    }
    if (data.logs?.length) {
      for (const l of data.logs) {
        const exists = await db.logs.get(l.id);
        if (!exists) await db.logs.add(l);
      }
    }
  }

  // Log import
  await db.logs.add({
    id: crypto.randomUUID(),
    action: 'data_imported',
    details: { mode, version: data.metadata?.version },
    createdAt: new Date().toISOString(),
  });

  return { success: true };
}
