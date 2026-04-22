import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { db, seedDatabase, resetDatabase } from './db/database';
import { ThemeProvider } from './context/ThemeContext';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Wallets from './pages/Wallets';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dbReady, setDbReady] = useState(false);
  const [openTransactionModal, setOpenTransactionModal] = useState(false);
  
  // Theme setup
  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'dark';
    root.classList.remove('dark', 'light');
    root.classList.add(savedTheme);
  }, []);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        // Seed the database
        await seedDatabase();
        
        // Set database as ready
        setDbReady(true);
      } catch (error) {
        console.error('Database initialization failed:', error);
        
        // If initial seeding fails, try clearing and resetting
        try {
          console.log('Attempting database reset...');
          await resetDatabase();
          setDbReady(true);
        } catch (resetError) {
          console.error('Database reset also failed:', resetError);
          
          // Last resort: try one more time with a delay
          setTimeout(async () => {
            try {
              await resetDatabase();
              setDbReady(true);
            } catch (finalError) {
              console.error('Final database initialization attempt failed:', finalError);
              // Show a user-friendly message but still try to load the app
              console.warn('Database initialization failed multiple times. App may be unstable.');
              setDbReady(true);
            }
          }, 1000);
        }
      }
    };

    initializeDatabase();
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
    <ThemeProvider>
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
        {page === 'transactions' && <Transactions openModal={openTransactionModal} onModalStateChange={setOpenTransactionModal} />}
        {page === 'wallets' && <Wallets />}
        {page === 'settings' && <Settings />}
      </main>

      {/* FAB - Add Transaction */}
      {(page === 'dashboard' || page === 'transactions') && (
        <button
          onClick={() => {
            if (page !== 'transactions') {
              setPage('transactions');
              setTimeout(() => {
                setOpenTransactionModal(true);
              }, 100);
            } else {
              setOpenTransactionModal(true);
            }
          }}
          className="fab"
          aria-label="Add Transaction"
        >
          <Plus size={24} />
        </button>
      )}

      <BottomNav active={page} onNavigate={handleNavigate} />
    </ThemeProvider>
  );
}
