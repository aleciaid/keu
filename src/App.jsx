import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { seedDatabase } from './db/database';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Wallets from './pages/Wallets';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    seedDatabase().then(() => setDbReady(true));
  }, []);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  }, []);

  const handleNavigate = useCallback((p) => setPage(p), []);

  if (!dbReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-2xl animate-pulse">
            💰
          </div>
          <p className="text-sm text-surface-400">Memuat...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 2500,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
          },
        }}
      />

      <main className="min-h-screen">
        {page === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
        {page === 'transactions' && <Transactions />}
        {page === 'wallets' && <Wallets />}
        {page === 'settings' && <Settings />}
      </main>

      {/* FAB - Add Transaction */}
      {(page === 'dashboard' || page === 'transactions') && (
        <button
          onClick={() => {
            setPage('transactions');
            // Trigger modal open after navigation
            setTimeout(() => {
              const addBtn = document.querySelector('[data-fab-trigger]');
              if (addBtn) addBtn.click();
            }, 100);
          }}
          className="fab"
          aria-label="Add Transaction"
        >
          <Plus size={24} />
        </button>
      )}

      <BottomNav active={page} onNavigate={handleNavigate} />
    </>
  );
}
