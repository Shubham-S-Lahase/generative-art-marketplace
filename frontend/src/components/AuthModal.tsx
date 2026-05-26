import React, { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';

const AuthModal = () => {
  const { authModal, setAuthModal, login, register } = useAuth();
  const [view, setView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    resetToken: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isLogin = view === 'login';
  const isRegister = view === 'register';

  const handleClose = () => {
    setAuthModal({ isOpen: false, mode: 'login' });
    setView('login');
    setFormData({ username: '', email: '', password: '', confirmPassword: '', resetToken: '' });
    setError('');
    setInfo('');
  };

  React.useEffect(() => {
    if (authModal.isOpen) {
      setView(authModal.mode === 'register' ? 'register' : 'login');
    }
  }, [authModal.isOpen, authModal.mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (view === 'forgot') {
        const res = await api.forgotPassword(formData.email);
        setInfo(res.message || 'Check your email for reset instructions.');
        if (res.resetToken) {
          setInfo(`${res.message} Dev token: ${res.resetToken}`);
          setFormData((prev) => ({ ...prev, resetToken: res.resetToken }));
          setView('reset');
        }
        setLoading(false);
        return;
      }

      if (view === 'reset') {
        await api.resetPassword(formData.resetToken, formData.password);
        setInfo('Password updated. You can sign in now.');
        setView('login');
        setLoading(false);
        return;
      }

      let result;
      if (isLogin) {
        result = await login({ email: formData.email, password: formData.password });
      } else {
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        result = await register({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        });
      }

      if (result.success) {
        handleClose();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const title =
    view === 'forgot'
      ? 'Forgot password'
      : view === 'reset'
        ? 'Reset password'
        : isLogin
          ? 'Sign In'
          : 'Create Account';

  if (!authModal.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={handleClose} />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}

              {(isLogin || isRegister || view === 'forgot') && (
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}

              {(isLogin || isRegister || view === 'reset') && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {view === 'reset' ? 'New password' : 'Password'}
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      className="block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                    </button>
                  </div>
                </div>
              )}

              {view === 'reset' && (
                <div>
                  <label htmlFor="resetToken" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reset token
                  </label>
                  <input
                    type="text"
                    id="resetToken"
                    name="resetToken"
                    value={formData.resetToken}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}

              {isRegister && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              )}

              {error && <div className="text-red-600 text-sm">{error}</div>}
              {info && <div className="text-green-600 dark:text-green-400 text-sm">{info}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading
                  ? '…'
                  : view === 'forgot'
                    ? 'Send reset link'
                    : view === 'reset'
                      ? 'Update password'
                      : isLogin
                        ? 'Sign In'
                        : 'Create Account'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400 space-y-2">
              {isLogin && (
                <button type="button" onClick={() => setView('forgot')} className="text-indigo-600 hover:text-indigo-500">
                  Forgot password?
                </button>
              )}
              {view !== 'forgot' && view !== 'reset' && (
                <p>
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                  <button
                    type="button"
                    onClick={() => setView(isLogin ? 'register' : 'login')}
                    className="ml-1 text-indigo-600 font-medium"
                  >
                    {isLogin ? 'Sign up' : 'Sign in'}
                  </button>
                </p>
              )}
              {(view === 'forgot' || view === 'reset') && (
                <button type="button" onClick={() => setView('login')} className="text-indigo-600">
                  Back to sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
