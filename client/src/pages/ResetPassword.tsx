import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/configurator'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="bg-white rounded-lg shadow p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reset Password</h1>
        <p className="text-sm text-gray-500 mb-6">Choose a new password for your account.</p>

        {!token && (
          <p className="text-sm text-red-600">This reset link is missing its token. Use the full link from your email.</p>
        )}

        {done ? (
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
            Password updated! Redirecting… Use the lock icon to sign in.
          </div>
        ) : token && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                minLength={8} required autoFocus
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-400">At least 8 characters.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
