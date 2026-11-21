import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';

// Load local .env if present (non-overwriting so systemd/container env always wins)
function loadLocalEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore malformed .env
  }
}

loadLocalEnvFile();

import { bindServerKV, ServerBootstrapPayload, ServerJobType } from './services/runtimeAdapter.ts';
import { registerServerStorageBackend } from './services/storage.ts';
import {
  providerManagerService,
  setServerProviderVaultBackend
} from './services/providerManagerService.ts';
import { modelDiscoveryService, validateBaseUrl } from './services/modelDiscoveryService.ts';
import { providerClientService } from './services/providerClientService.ts';
import { externalProviderService } from './services/externalProviderService.ts';
import { geminiService, setCooldownChangeHook } from './services/geminiService.ts';
import { plotDebugLogger } from './services/plotDebugLogger.ts';
import { requestThrottleService } from './services/requestThrottleService.ts';
import { tokenTracker } from './services/tokenTracker.ts';
import { serverVault } from './server/serverVault.ts';
import { serverJobManager } from './server/jobManager.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_COOKIE_NAME = 'aetheria_session';

// 1. Bind Authoritative Disk Vault to Isomorphic Service Layers BEFORE reading settings
bindServerKV(serverVault.createKVBackend());
registerServerStorageBackend({
  getAllStorySummaries: () => serverVault.getAllStorySummaries(),
  getStory: id => serverVault.getStory(id),
  getAllStories: () => serverVault.getAllStories(),
  saveStory: story => serverVault.saveStory(story),
  saveChapterDelta: (storyId, chapterId, content, title, translatedContent) =>
    serverVault.saveChapterDelta(storyId, chapterId, content, title, translatedContent),
  deleteStory: id => serverVault.deleteStory(id),
  saveVectors: vectors => serverVault.saveVectors(vectors),
  getVectorsByStory: storyId => serverVault.getVectorsByStory(storyId),
  deleteVectorsByStory: storyId => serverVault.deleteVectorsByStory(storyId),
  getStorageEstimate: () => {
    const calcSize = (dir: string): number => {
      if (!fs.existsSync(dir)) return 0;
      let total = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) total += calcSize(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      }
      return total;
    };
    const usedBytes = calcSize(serverVault.dataDir);
    const usedMB = +(usedBytes / (1024 * 1024)).toFixed(2);
    return { usedMB, quotaMB: 10240, percent: +((usedMB / 10240) * 100).toFixed(2) };
  }
});
setServerProviderVaultBackend({
  getProviderMetadataList: () => serverVault.getProviderMetadataList(),
  setProviderMetadataList: records => serverVault.setProviderMetadataList(records),
  getProviderSecret: id => serverVault.getProviderSecret(id),
  hasProviderSecret: id => serverVault.hasProviderSecret(id),
  setProviderSecret: (id, key) => serverVault.setProviderSecret(id, key),
  deleteProviderSecret: id => serverVault.deleteProviderSecret(id)
});

requestThrottleService.reloadPreferences();
tokenTracker.reloadFromStorage();

// 2. Cookie & Auth Helpers
function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function isRequestHttps(req: http.IncomingMessage): boolean {
  const expressReq = req as any;
  if (expressReq.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return proto.includes('https');
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const https = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'Max-Age=2592000',
    https ? 'SameSite=None' : 'SameSite=Lax'
  ];
  if (https) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const https = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    https ? 'SameSite=None' : 'SameSite=Lax'
  ];
  if (https) {
    parts.push('Secure', 'Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!serverVault.isPasswordEnabled()) {
    next();
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!serverVault.verifySessionToken(token)) {
    res.status(401).json({ error: 'Yêu cầu đăng nhập mật khẩu máy chủ.' });
    return;
  }
  next();
}

function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const xrw = req.headers['x-requested-with'];
  if (xrw === 'AetheriaRemote') {
    next();
    return;
  }
  const origin = req.headers.origin;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // fall through
    }
  }
  res.status(403).json({ error: 'Yêu cầu thiếu xác thực nguồn gốc hợp lệ (CSRF check).' });
}

// 3. Setup Express + HTTP + WebSocket Server
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use('/api', csrfGuard);

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set<WebSocket>();

function broadcast(event: string, data: any): void {
  if (wsClients.size === 0) return;
  const msg = JSON.stringify({ event, data });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch {
        // ignore closed socket race
      }
    }
  }
}

httpServer.on('upgrade', (req, socket, head) => {
  const urlPath = (req.url || '').split('?')[0];
  if (urlPath !== '/ws') {
    return;
  }

  if (serverVault.isPasswordEnabled()) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    if (!serverVault.verifySessionToken(token)) {
      wss.handleUpgrade(req, socket, head, ws => {
        ws.close(4401, 'Unauthorized');
      });
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, ws => {
    wsClients.add(ws);
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
    ws.send(JSON.stringify({ event: 'ws:connected', data: { serverTime: Date.now() } }));
  });
});

// Wire Live Change Hooks -> WebSocket Broadcast
serverVault.setChangeHooks({
  onSettingChanged: (key, value) => broadcast('settings:updated', { key, value }),
  onGeminiCredChanged: rawValue => broadcast('credentials:gemini_updated', { rawValue }),
  onStoryChanged: (storyId, action, story) => broadcast('story:updated', { storyId, action, story }),
  onProvidersChanged: () =>
    broadcast('providers:updated', {
      providers: providerManagerService.listProviders(),
      routing: providerManagerService.getRoutingConfig()
    })
});
serverJobManager.setBroadcastHook((event, data) => broadcast(event, data));
plotDebugLogger.setBroadcastHook(logs => broadcast('debug:logs_updated', logs));
requestThrottleService.setBroadcastHook(state => broadcast('throttle:updated', state));
tokenTracker.setBroadcastHook(logs => broadcast('token:updated', logs));
setCooldownChangeHook(snapshot =>
  broadcast('cooldowns:updated', {
    coolingGeminiKeys: snapshot,
    coolingProviderIds: externalProviderService.getCoolingProfileIdsSnapshot()
  })
);

// 4. REST API Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'server-authoritative',
    dataDir: serverVault.dataDir,
    passwordEnabled: serverVault.isPasswordEnabled(),
    uptimeSec: Math.round(process.uptime())
  });
});

app.get('/api/auth/status', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  res.json({
    authenticated: serverVault.verifySessionToken(token),
    passwordEnabled: serverVault.isPasswordEnabled(),
    envForcedPassword: serverVault.isEnvForcedPassword()
  });
});

app.post('/api/auth/login', (req, res) => {
  const password = String(req.body?.password || '');
  if (!serverVault.verifyPassword(password)) {
    res.status(401).json({ error: 'Mật khẩu máy chủ không đúng.' });
    return;
  }
  const token = serverVault.createSessionToken();
  setSessionCookie(req, res, token);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  serverVault.revokeSessionToken(cookies[SESSION_COOKIE_NAME]);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  try {
    const newPassword = req.body?.password ?? null;
    serverVault.setOptionalPassword(newPassword);
    if (serverVault.isPasswordEnabled()) {
      const token = serverVault.createSessionToken();
      setSessionCookie(req, res, token);
    } else {
      clearSessionCookie(req, res);
    }
    res.json({
      passwordEnabled: serverVault.isPasswordEnabled(),
      envForcedPassword: serverVault.isEnvForcedPassword()
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể cập nhật mật khẩu.' });
  }
});

app.get('/api/bootstrap', requireAuth, async (_req, res) => {
  await providerManagerService.initialize();
  const payload: ServerBootstrapPayload = {
    authenticated: true,
    passwordEnabled: serverVault.isPasswordEnabled(),
    envForcedPassword: serverVault.isEnvForcedPassword(),
    dataDir: serverVault.dataDir,
    settings: serverVault.getAllPublicSettings(),
    geminiApiKeyRaw: serverVault.getGeminiApiKeysRaw(),
    providers: providerManagerService.listProviders(),
    providerRouting: providerManagerService.getRoutingConfig(),
    storiesList: serverVault.getAllStorySummaries(),
    jobs: serverJobManager.listJobs(),
    debugLogs: plotDebugLogger.getLogs(),
    throttleState: requestThrottleService.getState(),
    coolingGeminiKeys: geminiService.getActiveCooldownsSnapshot(),
    coolingProviderIds: externalProviderService.getCoolingProfileIdsSnapshot(),
    tokenUsage: tokenTracker.getLogs()
  };
  res.json(payload);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const key = String(req.body?.key || '').trim();
  const value = req.body?.value ?? null;
  if (!key) {
    res.status(400).json({ error: 'Thiếu tên khóa cấu hình.' });
    return;
  }
  serverVault.setSetting(key, value);
  res.json({ ok: true });
});

app.put('/api/credentials/gemini', requireAuth, (req, res) => {
  const rawValue = String(req.body?.rawValue || '');
  serverVault.setGeminiApiKeysRaw(rawValue);
  geminiService.resetProModelFailed();
  res.json({ ok: true });
});

// Stories & Chapters
app.get('/api/stories', requireAuth, (req, res) => {
  if (req.query.full === '1') {
    res.json({ stories: serverVault.getAllStories() });
  } else {
    res.json({ stories: serverVault.getAllStorySummaries() });
  }
});

app.get('/api/stories/:id', requireAuth, (req, res) => {
  try {
    const story = serverVault.getStory(String(req.params.id));
    if (!story) {
      res.status(404).json({ error: 'Không tìm thấy truyện.' });
      return;
    }
    res.json({ story });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'ID không hợp lệ.' });
  }
});

app.put('/api/stories/:id', requireAuth, (req, res) => {
  try {
    const story = req.body?.story;
    if (!story || story.id !== req.params.id) {
      res.status(400).json({ error: 'Dữ liệu truyện không hợp lệ.' });
      return;
    }
    serverVault.saveStory(story);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể lưu truyện.' });
  }
});

app.patch('/api/stories/:id/chapters/:chapterId', requireAuth, (req, res) => {
  try {
    const { content, title, translatedContent } = req.body || {};
    serverVault.saveChapterDelta(
      String(req.params.id),
      String(req.params.chapterId),
      String(content ?? ''),
      title,
      translatedContent
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể cập nhật chương.' });
  }
});

app.delete('/api/stories/:id', requireAuth, (req, res) => {
  try {
    serverVault.deleteStory(String(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể xóa truyện.' });
  }
});

// Vectors
app.post('/api/vectors', requireAuth, (req, res) => {
  try {
    const vectors = Array.isArray(req.body?.vectors) ? req.body.vectors : [];
    serverVault.saveVectors(vectors);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể lưu vectors.' });
  }
});

app.get('/api/vectors/:storyId', requireAuth, (req, res) => {
  try {
    res.json({ vectors: serverVault.getVectorsByStory(String(req.params.storyId)) });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'ID không hợp lệ.' });
  }
});

app.delete('/api/vectors/:storyId', requireAuth, (req, res) => {
  try {
    serverVault.deleteVectorsByStory(String(req.params.storyId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'ID không hợp lệ.' });
  }
});

app.get('/api/storage/estimate', requireAuth, async (_req, res) => {
  const calcSize = (dir: string): number => {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += calcSize(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
    return total;
  };
  const usedBytes = calcSize(serverVault.dataDir);
  const usedMB = +(usedBytes / (1024 * 1024)).toFixed(2);
  res.json({ usedMB, quotaMB: 10240, percent: +((usedMB / 10240) * 100).toFixed(2) });
});

// Custom AI Providers
app.get('/api/providers', requireAuth, (_req, res) => {
  res.json({
    providers: providerManagerService.listProviders(),
    routing: providerManagerService.getRoutingConfig()
  });
});

app.post('/api/providers', requireAuth, async (req, res) => {
  try {
    const created = await providerManagerService.createProvider(req.body?.draft || {}, {
      activateRouting: req.body?.activateRouting !== false
    });
    res.json({ provider: created });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể tạo provider.' });
  }
});

app.put('/api/providers/routing', requireAuth, (req, res) => {
  providerManagerService.saveRoutingConfig(req.body || {});
  broadcast('providers:updated', {
    providers: providerManagerService.listProviders(),
    routing: providerManagerService.getRoutingConfig()
  });
  res.json({ ok: true });
});

app.put('/api/providers/bulk', requireAuth, async (req, res) => {
  try {
    await providerManagerService.saveAllProfiles(
      Array.isArray(req.body?.profiles) ? req.body.profiles : []
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể lưu danh sách providers.' });
  }
});

app.post('/api/providers/import', requireAuth, async (req, res) => {
  try {
    const out = await providerManagerService.importProvidersBundle(req.body?.rawJson, {
      replaceExisting: Boolean(req.body?.replaceExisting)
    });
    res.json(out);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể nhập providers.' });
  }
});

app.post('/api/providers/restore-drive', requireAuth, async (req, res) => {
  try {
    await providerManagerService.restoreFromDriveBackup(
      Array.isArray(req.body?.entries) ? req.body.entries : []
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể khôi phục từ Drive.' });
  }
});

app.post('/api/providers/discover-models', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const urlCheck = validateBaseUrl(String(body.baseUrl || ''));
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.error || 'Base URL không hợp lệ.' });
      return;
    }
    const result = await modelDiscoveryService.discoverModels({
      providerType: body.providerType || 'openai_compatible',
      baseUrl: urlCheck.normalized,
      apiKey: String(body.apiKey || ''),
      authScheme: body.authScheme,
      authHeaderName: body.authHeaderName,
      customHeaders: body.customHeaders,
      forceRefresh: Boolean(body.forceRefresh)
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Lỗi quét model từ máy chủ.' });
  }
});

app.post('/api/providers/test', requireAuth, async (req, res) => {
  try {
    const profile = req.body?.profile;
    const timeoutMs = Number(req.body?.timeoutMs || 15000);
    if (!profile) {
      res.status(400).json({ error: 'Thiếu thông tin provider.' });
      return;
    }
    const hydratedProfile = {
      ...profile,
      apiKey:
        profile.apiKey && String(profile.apiKey).trim()
          ? String(profile.apiKey).trim()
          : serverVault.getProviderSecret(String(profile.id || ''))
    };
    const result = await providerClientService.testConnection(hydratedProfile, timeoutMs);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      latencyMs: 0,
      errorCode: 'UNKNOWN',
      message: err?.message || 'Lỗi kiểm tra kết nối.'
    });
  }
});

app.put('/api/providers/:id', requireAuth, async (req, res) => {
  try {
    const updated = await providerManagerService.updateProvider(
      String(req.params.id),
      req.body?.draft || {}
    );
    res.json({ provider: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể cập nhật provider.' });
  }
});

app.post('/api/providers/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const cloned = await providerManagerService.duplicateProvider(String(req.params.id));
    res.json({ provider: cloned });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể nhân bản provider.' });
  }
});

app.delete('/api/providers/:id', requireAuth, async (req, res) => {
  try {
    await providerManagerService.deleteProvider(String(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể xóa provider.' });
  }
});

app.post('/api/providers/:id/default', requireAuth, async (req, res) => {
  try {
    const updated = await providerManagerService.setDefaultProvider(
      String(req.params.id),
      req.body?.activateExternalRouting !== false
    );
    res.json({ provider: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể đặt provider mặc định.' });
  }
});

app.post('/api/providers/:id/test-result', requireAuth, async (req, res) => {
  try {
    await providerManagerService.recordTestResult(String(req.params.id), {
      success: Boolean(req.body?.success),
      message: String(req.body?.message || '')
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Không thể lưu kết quả kiểm tra.' });
  }
});

// Gemini Key Diagnostics & Server Controls
app.post('/api/keys/test', requireAuth, async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  const mode = req.body?.mode === 'direct' ? 'direct' : 'simple';
  const model = req.body?.model ? String(req.body.model) : undefined;
  const timeoutMs = req.body?.timeoutMs ? Number(req.body.timeoutMs) : undefined;

  if (!apiKey) {
    res.status(400).json({ success: false, message: 'Vui lòng nhập API Key.' });
    return;
  }

  try {
    if (mode === 'direct') {
      const result = await geminiService.testSingleKeyDirectly(apiKey, model, { timeoutMs });
      res.json(result);
    } else {
      const result = await geminiService.testApiKey(apiKey);
      res.json(result);
    }
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || String(err),
      message: err?.message || String(err)
    });
  }
});

app.post('/api/cooldowns/reset', requireAuth, (_req, res) => {
  geminiService.clearAllCooldowns();
  externalProviderService.clearAllCooldowns();
  broadcast('cooldowns:updated', {
    coolingGeminiKeys: geminiService.getActiveCooldownsSnapshot(),
    coolingProviderIds: externalProviderService.getCoolingProfileIdsSnapshot()
  });
  res.json({ ok: true });
});

app.put('/api/throttle', requireAuth, (req, res) => {
  const { mode, interRequestDelayMs } = req.body || {};
  if (mode && ['auto', 'sequential', 'parallel'].includes(mode)) {
    requestThrottleService.setMode(mode);
  }
  if (typeof interRequestDelayMs === 'number' && !Number.isNaN(interRequestDelayMs)) {
    requestThrottleService.setInterRequestDelay(interRequestDelayMs);
  }
  res.json({ state: requestThrottleService.getState() });
});

app.post('/api/debug/clear', requireAuth, (_req, res) => {
  plotDebugLogger.clearLogs();
  res.json({ ok: true });
});

// Background Authoritative AI Jobs
app.get('/api/jobs', requireAuth, (_req, res) => {
  res.json({ jobs: serverJobManager.listJobs() });
});

app.post('/api/jobs', requireAuth, (req, res) => {
  const type = req.body?.type as ServerJobType;
  const payload = req.body?.payload || {};
  if (!type) {
    res.status(400).json({ error: 'Thiếu loại tác vụ AI (job type).' });
    return;
  }
  const job = serverJobManager.startJob(type, payload);
  res.json({ job });
});

app.post('/api/jobs/:id/cancel', requireAuth, (req, res) => {
  const ok = serverJobManager.cancelJob(String(req.params.id));
  res.json({ ok });
});

app.post('/api/jobs/:id/ack', requireAuth, (req, res) => {
  serverJobManager.ackJob(String(req.params.id));
  res.json({ ok: true });
});

// Synchronous Utility AI Helpers
app.post('/api/ai/utility', requireAuth, async (req, res) => {
  try {
    const action = String(req.body?.action || '');
    const result = await serverJobManager.runUtilityAction(action, req.body?.payload || {});
    res.json({ result });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Lỗi xử lý tiện ích AI.' });
  }
});

// 5. Vite Middleware (Dev) or Static Dist Serving (Production)
async function start() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/ws') {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(
      `[Aetheria Server] Running (${isProd ? 'production' : 'development'}) at http://${HOST}:${PORT}`
    );
    console.log(`[Aetheria Server] Persistent Data Dir: ${serverVault.dataDir}`);
    console.log(
      `[Aetheria Server] Optional Password Lock: ${serverVault.isPasswordEnabled() ? 'ENABLED' : 'DISABLED'}`
    );
  });
}

void start().catch(err => {
  console.error('[Aetheria Server] Fatal startup error:', err);
  process.exit(1);
});
