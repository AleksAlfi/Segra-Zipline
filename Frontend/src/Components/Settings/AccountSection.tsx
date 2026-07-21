import React, { useState } from 'react';
import { TriangleAlert, LogOut, Ellipsis, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../Hooks/useAuth';
import Button from '../Button';

type AuthTab = 'password' | 'token';

export default function AccountSection() {
  const {
    user,
    serverUrl,
    isAuthenticated,
    isAuthenticating,
    authError,
    totpRequired,
    clearAuthError,
    loginWithPassword,
    loginWithToken,
    signOut,
  } = useAuth();
  const [error, setError] = useState('');
  const [server, setServer] = useState(() => localStorage.getItem('ziplineServerUrl') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [tab, setTab] = useState<AuthTab>(() =>
    localStorage.getItem('ziplineLoginMethod') === 'token' ? 'token' : 'password',
  );

  const validateServer = () => {
    if (!server.trim()) {
      setError('Enter your Zipline server URL');
      return false;
    }
    return true;
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearAuthError();
    if (!validateServer()) return;
    localStorage.setItem('ziplineServerUrl', server.trim());
    localStorage.setItem('ziplineLoginMethod', 'password');
    loginWithPassword(server.trim(), username, password, code.trim() || undefined);
  };

  const handleTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    clearAuthError();
    if (!validateServer()) return;
    if (!apiToken.trim()) {
      setError('Enter your Zipline API token');
      return;
    }
    localStorage.setItem('ziplineServerUrl', server.trim());
    localStorage.setItem('ziplineLoginMethod', 'token');
    loginWithToken(server.trim(), apiToken.trim());
  };

  const handleLogout = async () => {
    signOut();
  };

  const displayError = error || authError;

  if (!isAuthenticated) {
    return (
      <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom space-y-4">
        {displayError && (
          <div className="alert alert-error" role="alert">
            <TriangleAlert className="w-5 h-5" />
            <span>{displayError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="form-control">
            <div className="mb-2">Zipline Server URL</div>
            <input
              type="url"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              className="input input-bordered bg-base-200 w-full"
              disabled={isAuthenticating}
              placeholder="https://zipline.example.com"
              required
            />
          </div>

          {/* Tab toggle */}
          <div className="tabs tabs-boxed justify-center">
            <button
              className={`tab ${tab === 'password' ? 'tab-active' : ''}`}
              onClick={() => {
                setTab('password');
                setError('');
                clearAuthError();
              }}
            >
              Password
            </button>
            <button
              className={`tab ${tab === 'token' ? 'tab-active' : ''}`}
              onClick={() => {
                setTab('token');
                setError('');
                clearAuthError();
              }}
            >
              API Token
            </button>
          </div>

          {tab === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div className="form-control">
                <div className="mb-2">Username</div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input input-bordered bg-base-200 w-full"
                  disabled={isAuthenticating}
                  placeholder="username"
                  required
                />
              </div>

              <div className="form-control">
                <div className="mb-2">Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input input-bordered bg-base-200 w-full"
                  disabled={isAuthenticating}
                  placeholder="********"
                  required
                />
              </div>

              {totpRequired && (
                <div className="form-control">
                  <div className="mb-2 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" />
                    Two-Factor Code
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input input-bordered bg-base-200 w-full"
                    disabled={isAuthenticating}
                    placeholder="123456"
                    autoFocus
                  />
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full font-semibold text-white border-custom hover:border-custom"
                loading={isAuthenticating}
              >
                <Lock size={20} />
                Connect to Zipline
              </Button>
            </form>
          ) : (
            <form onSubmit={handleTokenLogin} className="space-y-4">
              <div className="form-control">
                <div className="mb-2">API Token</div>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="input input-bordered bg-base-200 w-full"
                  disabled={isAuthenticating}
                  placeholder="Paste your API token"
                  required
                />
                <div className="text-xs opacity-60 mt-2">
                  Found in your Zipline dashboard under Settings → API Token
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full font-semibold text-white border-custom hover:border-custom"
                loading={isAuthenticating}
              >
                <KeyRound size={20} />
                Connect to Zipline
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* Avatar Container */}
          <div className="relative w-16 h-16">
            <div className="w-full h-full rounded-full overflow-hidden bg-base-200 ring-2 ring-base-300">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={`${user.username}'s avatar`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-avatar.png';
                  }}
                />
              ) : (
                <div
                  className="w-full h-full bg-base-300 flex items-center justify-center"
                  aria-hidden="true"
                >
                  <span className="text-2xl font-bold uppercase">
                    {user?.username?.charAt(0) || '?'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold truncate">{user?.username}</h3>
            <p className="text-sm opacity-70 truncate">{serverUrl}</p>
          </div>

          {/* More Options Dropdown */}
          <div className="dropdown">
            <label
              tabIndex={0}
              className="btn btn-ghost btn-sm btn-circle hover:bg-white/10 active:bg-white/10"
            >
              <Ellipsis size={24} />
            </label>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-300 border border-base-400 rounded-box z-999 w-52 p-2"
            >
              <li>
                <Button
                  variant="menuDanger"
                  onClick={() => {
                    (document.activeElement as HTMLElement).blur();
                    handleLogout();
                  }}
                >
                  <LogOut size={20} />
                  <span>Logout</span>
                </Button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
