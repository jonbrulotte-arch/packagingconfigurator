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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center fixed inset-0 z-50">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Packaging <span className="text-blue-400">Config</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">Packaging Configurator</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {mode === 'forgot' ? 'Reset Password' : mode === 'legacy' ? 'Admin Access' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(mode === 'user' || mode === 'forgot') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  {mode === 'user' && (
                    <button type="button" onClick={() => switchMode('forgot')} className="text-xs text-blue-600 hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  ref={mode === 'legacy' ? inputRef : undefined}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode !== 'forgot' && !password) || (mode !== 'legacy' && !email)}
              className="w-full inline-flex items-center justify-center h-9 px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? 'Signing in...' : mode === 'forgot' ? 'Send Reset Link' : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-1.5 text-center">
            {mode === 'user' && (
              <button onClick={() => switchMode('legacy')} className="text-xs text-gray-400 hover:text-gray-600">
                Use admin password instead
              </button>
            )}
            {mode !== 'user' && (
              <button onClick={() => switchMode('user')} className="text-xs text-blue-600 hover:underline">
                &larr; Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
