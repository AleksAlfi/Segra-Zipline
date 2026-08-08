import React, { useEffect, useRef, useState } from 'react';
import { TriangleAlert, LogOut, Ellipsis, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { DiscordIcon } from '../icons/BrandIcons';
import { useAuth } from '../../Hooks/useAuth';
import { useSettings, useSettingsUpdater } from '../../Context/SettingsContext';
import Button from '../Button';

type AuthTab = 'password' | 'token';

export default function AccountSection() {
  const {
    user,
    serverUrl,
    defaultServerUrl,
    isAuthenticated,
    isAuthenticating,
    isWaitingForDiscord,
    authError,
    totpRequired,
    clearAuthError,
    loginWithPassword,
    loginWithToken,
    loginWithDiscord,
    cancelDiscordLogin,
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
  const { ziplineFolder, ziplineDomain, ziplineGroupByGame } = useSettings();
  const updateSettings = useSettingsUpdater();
  const [folderDraft, setFolderDraft] = useState(ziplineFolder);
  const [domainDraft, setDomainDraft] = useState(ziplineDomain);

  // Keep drafts in sync when settings arrive from the backend
  useEffect(() => setFolderDraft(ziplineFolder), [ziplineFolder]);
  useEffect(() => setDomainDraft(ziplineDomain), [ziplineDomain]);

  // Prefill the server URL once from the build's baked-in default (if any)
  const prefilledServerRef = useRef(false);
  useEffect(() => {
    if (!prefilledServerRef.current && defaultServerUrl && !server) {
      prefilledServerRef.current = true;
      setServer(defaultServerUrl);
    }
  }, [defaultServerUrl, server]);

  const commitUploadOptions = () => {
    const folder = folderDraft.trim();
    const domain = domainDraft
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    setFolderDraft(folder);
    setDomainDraft(domain);
    if (folder !== ziplineFolder || domain !== ziplineDomain) {
      updateSettings({ ziplineFolder: folder, ziplineDomain: domain });
    }
  };

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

  const handleDiscordLogin = () => {
    setError('');
    clearAuthError();
    if (!validateServer()) return;
    localStorage.setItem('ziplineServerUrl', server.trim());
    localStorage.setItem('ziplineLoginMethod', 'discord');
    loginWithDiscord(server.trim());
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

          <Button
            variant="primary"
            className="w-full gap-2 font-semibold text-white border-custom hover:border-custom"
            onClick={handleDiscordLogin}
            loading={isWaitingForDiscord}
            disabled={isAuthenticating}
          >
            {!isWaitingForDiscord && <DiscordIcon className="w-5 h-5" />}
            {isWaitingForDiscord ? 'Waiting for your token...' : 'Sign in with Discord'}
          </Button>

          {isWaitingForDiscord && (
            <div className="text-xs text-gray-400 space-y-1 -mt-2">
              <p>
                1. Finish signing in with Discord in your browser.
                <br />
                2. In the Zipline dashboard, open Settings and click the copy-token button next to
                your API token — Segra picks it up automatically.
              </p>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-gray-200"
                onClick={cancelDiscordLogin}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="divider">Or</div>

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
    <div className="p-4 bg-base-300 rounded-lg shadow-md border border-custom space-y-4">
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

      {/* Upload options */}
      <div className="border-t border-custom pt-4 space-y-4">
        <h4 className="font-semibold">Upload Options</h4>

        <div className="form-control">
          <div className="mb-2">Folder</div>
          <input
            type="text"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            onBlur={commitUploadOptions}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="input input-bordered bg-base-200 w-full"
            placeholder="Clips"
          />
          <div className="text-xs opacity-60 mt-2">
            Uploads are filed into this Zipline folder (created automatically). Leave empty to
            upload to the root.
          </div>
        </div>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={ziplineGroupByGame}
              onChange={(e) => updateSettings({ ziplineGroupByGame: e.target.checked })}
            />
            <span className="label-text text-base-content">Organize by game</span>
          </label>
          <div className="text-xs opacity-60">
            Files each upload into a per-game subfolder (e.g. Clips → Overwatch). Needs a Zipline
            version with nested-folder support; otherwise uploads fall back to the main folder.
          </div>
        </div>

        <div className="form-control">
          <div className="mb-2">Share Domain</div>
          <input
            type="text"
            value={domainDraft}
            onChange={(e) => setDomainDraft(e.target.value)}
            onBlur={commitUploadOptions}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="input input-bordered bg-base-200 w-full"
            placeholder="clip.example.com"
          />
          <div className="text-xs opacity-60 mt-2">
            Share links use this domain instead of the server default. The domain must point at your
            Zipline instance (DNS + reverse proxy). Leave empty to use the server URL.
          </div>
        </div>
      </div>
    </div>
  );
}
