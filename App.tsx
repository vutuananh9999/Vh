import React, { useState, useEffect, useCallback } from 'react';
import { StoryProvider, useStory } from './context/StoryContext.tsx';
import { MainWorkspace } from './components/MainWorkspace.tsx';
import { CreateWizard } from './components/CreateWizard.tsx';
import { StoryLibrary } from './components/StoryLibrary.tsx';
import { Watermarks } from './components/Watermarks.tsx';
import {
  isStandaloneMode,
  ServerJobState,
  serverSyncClient,
  setStandaloneMode
} from './services/runtimeAdapter.ts';
import { initCapacitorNativeShell } from './services/iosNativeBridge.ts';
import { registerStandaloneRuntime } from './services/localJobRunner.ts';
import { providerManagerService } from './services/providerManagerService.ts';
import { plotDebugLogger } from './services/plotDebugLogger.ts';
import { requestThrottleService } from './services/requestThrottleService.ts';
import { tokenTracker } from './services/tokenTracker.ts';
import { geminiService } from './services/geminiService.ts';
import { externalProviderService } from './services/externalProviderService.ts';

const AppContent: React.FC = () => {
  const { story, isStoriesLoaded, toastMessage, dismissToast } = useStory();
  const [viewMode, setViewMode] = useState<'library' | 'create'>('library');

  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      if (wakeLock !== null) return;
      try {
        wakeLock = await (navigator as any).wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        // Wake lock optional on remote displays
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    const handleInteraction = async () => {
      await requestWakeLock();
    };

    void requestWakeLock();
    const interactionEvents = ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'];
    interactionEvents.forEach(event => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      interactionEvents.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  if (!isStoriesLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950">
        <div
          className="loader-spinner mb-5"
          style={{
            width: '48px',
            height: '48px',
            border: '4px solid rgba(14, 165, 233, 0.2)',
            borderRadius: '50%',
            borderTopColor: '#0ea5e9',
            animation: 'spin 1s ease-in-out infinite'
          }}
        ></div>
        <div className="text-primary-500 text-sm font-medium tracking-wide animate-pulse">
          {isStandaloneMode()
            ? 'Đang khởi tạo kho truyện trên thiết bị...'
            : 'Đang đồng bộ dữ liệu từ máy chủ...'}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[200] max-w-sm animate-fadeIn">
          <div
            className={`px-4 py-3 rounded-xl border shadow-2xl flex items-start gap-3 text-xs backdrop-blur-md ${
              toastMessage.type === 'error'
                ? 'bg-red-950/95 border-red-500/40 text-red-200'
                : toastMessage.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                : 'bg-slate-900/95 border-sky-500/40 text-sky-100'
            }`}
          >
            <span className="flex-1 leading-relaxed">{toastMessage.text}</span>
            <button
              type="button"
              onClick={dismissToast}
              className="text-current opacity-60 hover:opacity-100 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {story ? (
        <MainWorkspace />
      ) : viewMode === 'create' ? (
        <CreateWizard onCancel={() => setViewMode('library')} />
      ) : (
        <StoryLibrary onCreateNew={() => setViewMode('create')} />
      )}

      {!story && <Watermarks />}
    </>
  );
};

interface ServerMetaInfo {
  dataDir?: string;
  passwordEnabled: boolean;
  envForcedPassword: boolean;
  standaloneMode?: boolean;
}

const App: React.FC = () => {
  const [bootState, setBootState] = useState<'checking' | 'locked' | 'ready' | 'error'>('checking');
  const [bootError, setBootError] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [initialJobs, setInitialJobs] = useState<ServerJobState[]>([]);
  const [serverMeta, setServerMeta] = useState<ServerMetaInfo>({
    passwordEnabled: false,
    envForcedPassword: false,
    standaloneMode: isStandaloneMode()
  });

  const hydrateFromBootstrap = useCallback(async () => {
    try {
      setBootError('');
      void initCapacitorNativeShell();

      if (isStandaloneMode()) {
        registerStandaloneRuntime();
      } else {
        try {
          const auth = await serverSyncClient.getAuthStatus();
          if (auth.passwordEnabled && !auth.authenticated) {
            setServerMeta({
              passwordEnabled: auth.passwordEnabled,
              envForcedPassword: auth.envForcedPassword,
              standaloneMode: false
            });
            setBootState('locked');
            return;
          }
        } catch (authErr: any) {
          const msg = String(authErr?.message || '');
          const isStaticMissingBackend =
            msg.includes('404') ||
            msg.includes('Cannot GET') ||
            msg.includes('<!DOCTYPE') ||
            msg.includes('Unexpected token');
          if (isStaticMissingBackend) {
            setStandaloneMode(true);
            registerStandaloneRuntime();
          } else {
            throw authErr;
          }
        }
      }

      const data = await serverSyncClient.bootstrap();
      providerManagerService.hydrateFromServer(data.providers, data.providerRouting);
      plotDebugLogger.hydrateFromServer(data.debugLogs);
      requestThrottleService.hydrateFromServer(data.throttleState);
      tokenTracker.hydrateFromServer(data.tokenUsage);
      geminiService.hydrateCooldownsFromServer(data.coolingGeminiKeys);
      externalProviderService.hydrateCooldownsFromServer(data.coolingProviderIds);
      setInitialJobs(data.jobs || []);
      setServerMeta({
        dataDir: data.dataDir,
        passwordEnabled: data.passwordEnabled,
        envForcedPassword: data.envForcedPassword,
        standaloneMode: Boolean(data.standaloneMode || isStandaloneMode())
      });

      if (!isStandaloneMode()) {
        serverSyncClient.connectWebSocket(() => {
          void serverSyncClient.bootstrap().then(fresh => {
            providerManagerService.hydrateFromServer(fresh.providers, fresh.providerRouting);
            plotDebugLogger.hydrateFromServer(fresh.debugLogs);
            requestThrottleService.hydrateFromServer(fresh.throttleState);
            tokenTracker.hydrateFromServer(fresh.tokenUsage);
            geminiService.hydrateCooldownsFromServer(fresh.coolingGeminiKeys);
            externalProviderService.hydrateCooldownsFromServer(fresh.coolingProviderIds);
          }).catch(() => {});
        });
      }

      setBootState('ready');
    } catch (err: any) {
      setBootError(err?.message || 'Không thể kết nối tới máy chủ Aetheria.');
      setBootState('error');
    }
  }, []);

  useEffect(() => {
    void hydrateFromBootstrap();

    const onAuthRequired = () => {
      serverSyncClient.disconnectWebSocket();
      setBootState('locked');
    };

    const unsubProviders = serverSyncClient.subscribe('providers:updated', data => {
      if (data) {
        providerManagerService.hydrateFromServer(data.providers, data.routing);
      }
    });
    const unsubDebug = serverSyncClient.subscribe('debug:logs_updated', logs => {
      plotDebugLogger.hydrateFromServer(logs);
    });
    const unsubThrottle = serverSyncClient.subscribe('throttle:updated', state => {
      requestThrottleService.hydrateFromServer(state);
    });
    const unsubTokens = serverSyncClient.subscribe('token:updated', logs => {
      tokenTracker.hydrateFromServer(logs);
    });
    const unsubCooldowns = serverSyncClient.subscribe('cooldowns:updated', payload => {
      if (payload?.coolingGeminiKeys) {
        geminiService.hydrateCooldownsFromServer(payload.coolingGeminiKeys);
      }
      if (payload?.coolingProviderIds) {
        externalProviderService.hydrateCooldownsFromServer(payload.coolingProviderIds);
      }
    });

    window.addEventListener('aetheria_auth_required', onAuthRequired);

    return () => {
      window.removeEventListener('aetheria_auth_required', onAuthRequired);
      unsubProviders();
      unsubDebug();
      unsubThrottle();
      unsubTokens();
      unsubCooldowns();
    };
  }, [hydrateFromBootstrap]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim() || isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError('');
    try {
      await serverSyncClient.login(passwordInput);
      setPasswordInput('');
      setBootState('checking');
      await hydrateFromBootstrap();
    } catch (err: any) {
      setLoginError(err?.message || 'Mật khẩu không đúng.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (bootState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-slate-200">
        <div
          className="mb-4"
          style={{
            width: '44px',
            height: '44px',
            border: '4px solid rgba(14, 165, 233, 0.2)',
            borderRadius: '50%',
            borderTopColor: '#0ea5e9',
            animation: 'spin 1s linear infinite'
          }}
        />
        <div className="text-sky-400 text-sm font-medium animate-pulse">
          {isStandaloneMode()
            ? 'Đang khởi tạo ứng dụng Aetheria...'
            : 'Đang kết nối máy chủ điều khiển từ xa...'}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (bootState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 p-6 text-center text-slate-200">
        <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div className="text-red-400 text-lg font-bold">Mất kết nối máy chủ Aetheria</div>
          <p className="text-xs text-gray-400 leading-relaxed">{bootError}</p>
          <div className="space-y-2.5 pt-1">
            <button
              onClick={() => {
                setBootState('checking');
                void hydrateFromBootstrap();
              }}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Thử kết nối lại
            </button>
            <button
              onClick={() => {
                setStandaloneMode(true);
                registerStandaloneRuntime();
                setBootState('checking');
                void hydrateFromBootstrap();
              }}
              className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Dùng Chế Độ Độc Lập Trên Thiết Bị (Offline)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (bootState === 'locked') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 p-4 text-slate-200">
        <form
          onSubmit={handleLoginSubmit}
          className="max-w-sm w-full bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 shadow-2xl"
        >
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white">Mở khóa Aetheria Server</h1>
            <p className="text-xs text-gray-400">
              Nhập mật khẩu máy chủ để điều khiển từ thiết bị này
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Mật khẩu máy chủ..."
              className="w-full bg-gray-950 border border-gray-700 focus:border-sky-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-colors"
            />
            {loginError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {loginError}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoggingIn || !passwordInput.trim()}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {isLoggingIn ? 'Đang xác thực...' : 'Mở khóa & Điều khiển'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <StoryProvider initialJobs={initialJobs} serverMeta={serverMeta}>
      <AppContent />
    </StoryProvider>
  );
};

export default App;
