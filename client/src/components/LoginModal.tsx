import { useState, useRef, useEffect } from 'react';
import { login, forgotPassword } from '../api';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'user' | 'legacy' | 'forgot';

export default function LoginModal() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    if (mode === 'forgot') {
      try {
        const result = await forgotPassword(email);
        setInfo(result.message);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    const result = mode === 'user' ? await login(password, email) : await login(password);
    setLoading(false);
    if (result.success) {
      await refresh();
    } else {
      setError(result.error ?? 'Sign in failed');
      setPassword('');
      inputRef.current?.focus();
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    setPassword('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-brand-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'forgot' ? 'Reset Password' : mode === 'legacy' ? 'Admin Access' : 'Sign In'}
            </h2>
            <p className="text-sm text-gray-500">
              {mode === 'forgot'
                ? "Enter your account email and we'll send a reset link."
                : mode === 'legacy'
                ? 'Enter the admin password to continue.'
                : 'Sign in with your account email and password.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(mode === 'user' || mode === 'forgot') && (
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
          {mode !== 'forgot' && (
            <input
              ref={mode === 'legacy' ? inputRef : undefined}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <button
            type="submit"
            disabled={loading || (mode !== 'forgot' && !password) || (mode !== 'legacy' && !email)}
            className="w-full px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? 'Working…' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-1.5 text-center">
          {mode === 'user' && (
            <>
              <button onClick={() => switchMode('forgot')} className="text-xs text-brand-600 hover:text-brand-800">
                Forgot password?
              </button>
              <button onClick={() => switchMode('legacy')} className="text-xs text-gray-400 hover:text-gray-600">
                Use admin password instead
              </button>
            </>
          )}
          {mode !== 'user' && (
            <button onClick={() => switchMode('user')} className="text-xs text-brand-600 hover:text-brand-800">
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
