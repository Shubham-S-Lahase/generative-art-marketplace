import React from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import ArtCreator from './components/ArtCreator';
import Gallery from './components/Gallery';
import Dashboard from './components/Dashboard';
import LiveSessions from './components/LiveSessions';
import Marketplace from './components/Marketplace';
import PurchaseHistory from './components/PurchaseHistory';
import MyLicenses from './components/MyLicenses';
import Profile from './components/Profile';
import AuthModal from './components/AuthModal';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import NotificationSystem from './components/NotificationSystem';
import NotificationBell from './components/NotificationBell';
import ArtworkDetail from './components/ArtworkDetail';
import { User, LogOut } from 'lucide-react';

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
          <Header />
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/create" element={<ArtCreator />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sessions" element={<LiveSessions />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/purchases" element={<PurchaseHistory />} />
            <Route path="/licenses" element={<MyLicenses />} />
            <Route path="/profile/:username" element={<Profile />} />
          <Route path="/artwork/:id" element={<ArtworkDetail />} />
          </Routes>
          <AuthModal />
          <NotificationSystem />
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
};

const Header = () => {
  const { currentUser, setAuthModal, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogin = () => {
    setAuthModal({ isOpen: true, mode: 'login' });
  };

  const handleSignUp = () => {
    setAuthModal({ isOpen: true, mode: 'register' });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
          GenArt
        </Link>
        <nav className="flex items-center space-x-4 text-sm font-medium">
          <Link to="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Gallery
          </Link>
          <Link to="/create" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Create
          </Link>
          <Link to="/marketplace" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Marketplace
          </Link>
          <Link to="/sessions" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Live
          </Link>
          {currentUser && (
            <>
              <Link to="/purchases" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Purchases
              </Link>
              <Link to="/licenses" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Licenses
              </Link>
              <Link to="/dashboard" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                Dashboard
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center space-x-4">
          {currentUser ? (
            <>
              <NotificationBell />
              <Link
                to={`/profile/${currentUser.username}`}
                className="flex items-center space-x-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <User className="h-5 w-5" />
                <span className="hidden sm:inline">{currentUser.username}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleLogin}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                Login
              </button>
              <button
                onClick={handleSignUp}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default App;

