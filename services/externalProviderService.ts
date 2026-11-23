import { plotDebugLogger } from './plotDebugLogger.ts';
import { tokenTracker } from './tokenTracker.ts';
import {
  AIProviderType,
  ConnectionTestResult,
  ExternalProviderProfile,
  ProviderRoutingConfig,
  ProviderTaskRole
} from './providerTypes.ts';
import { PROVIDER_PRESETS } from './modelDiscoveryService.ts';
import {
  isTransientProviderError,
  providerClientService
} from './providerClientService.ts';
import {
  PROVIDER_ROUTING_STORAGE_KEY,
  providerManagerService
} from './providerManagerService.ts';
import { redactSecrets } from './secureCredentialStorage.ts';
import { isServerRuntime, serverSyncClient } from './runtimeAdapter.ts';
import { getActiveJobAbortContext, isAbortError, throwIfAborted } from './jobAbortContext.ts';

export type {
  AIProviderType,
  ProviderTaskRole,
  ExternalProviderProfile,
  ProviderRoutingConfig,
  ProviderPreset,
  ProviderAuthScheme,
  DiscoveredModel,
  ModelDiscoveryResult,
  ConnectionTestResult
} from './providerTypes.ts';

export { PROVIDER_PRESETS, PROVIDER_ROUTING_STORAGE_KEY };
export const EXTERNAL_PROVIDERS_STORAGE_KEY = 'aetheria_external_providers_v1';

const externalCooldowns = new Map<string, number>();
let lastExternalPoolIndex = 0;

export const externalProviderService = {
  getProfiles(): ExternalProviderProfile[] {
    return providerManagerService.listProviders();
  },

  saveProfiles(profiles: ExternalProviderProfile[]): void {
    void providerManagerService.saveAllProfiles(profiles);
  },

  getRoutingConfig(): ProviderRoutingConfig {
    return providerManagerService.getRoutingConfig();
  },

  saveRoutingConfig(config: ProviderRoutingConfig): void {
    providerManagerService.saveRoutingConfig(config);
  },

  isProfileCoolingDown(id: string): boolean {
    const exp = externalCooldowns.get(id);
    if (!exp) return false;
    if (Date.now() >= exp) {
      externalCooldowns.delete(id);
      return false;
    }
    return true;
  },

  markProfileRateLimited(id: string, cooldownMs: number = 25000): void {
    externalCooldowns.set(id, Date.now() + cooldownMs);
  },

  clearProfileCooldown(id: string): void {
    externalCooldowns.delete(id);
  },

  clearAllCooldowns(): void {
    externalCooldowns.clear();
    if (typeof window !== 'undefined' && !isServerRuntime()) {
      void serverSyncClient.resetAllCooldowns().catch(() => {});
    }
  },

  getCoolingProfileIdsSnapshot(): string[] {
    const now = Date.now();
    const ids: string[] = [];
    for (const [id, exp] of externalCooldowns.entries()) {
      if (exp > now) ids.push(id);
      else externalCooldowns.delete(id);
    }
    return ids;
  },

  hydrateCooldownsFromServer(ids: string[]): void {
    externalCooldowns.clear();
    const until = Date.now() + 25000;
    for (const id of ids || []) {
      if (id) externalCooldowns.set(id, until);
    }
  },

  getCandidateProfilesForTask(tier: 'pro' | 'flash'): ExternalProviderProfile[] {
    const routing = this.getRoutingConfig();
    const backend = tier === 'pro' ? routing.activeProBackend : routing.activeFlashBackend;
    if (backend !== 'external') return [];

    const all = this.getProfiles().filter(p => {
      if (!p.enabled) return false;
      return providerManagerService.isConfiguredProvider(p);
    });

    const matching = all.filter(p => p.role === tier || p.role === 'all');
    // Default provider first, then exact role match, then priority
    matching.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const aExact = a.role === tier ? 0 : 1;
      const bExact = b.role === tier ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return (a.priority || 0) - (b.priority || 0);
    });
    return matching;
  },

  async invokeGenerateSingle(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    signal?: AbortSignal
  ): Promise<any> {
    return providerClientService.invokeGenerate(profile, params, sendParams, signal);
  },

  async *invokeStreamSingle(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    onChunk?: (text: string) => void,
    signal?: AbortSignal
  ): AsyncGenerator<any, void, unknown> {
    yield* providerClientService.invokeStream(profile, params, sendParams, onChunk, signal);
  },

  async executeWithPool(
    profiles: ExternalProviderProfile[],
    params: any,
    ctx: {
      logId: string;
      ownsLog: boolean;
      sendParams?: any;
      extractText: (res: any) => string;
      signal?: AbortSignal;
    }
  ): Promise<any> {
    if (profiles.length === 0) {
      throw new Error('Không có Custom AI Provider nào được bật.');
    }

    const effectiveSignal = ctx.signal || getActiveJobAbortContext().signal;
    throwIfAborted(effectiveSignal);

    let lastErr: any = null;
    const defaultProfile = profiles.find(p => p.isDefault);
    // Prioritize default profile cleanly if healthy, otherwise round-robin across configured providers
    const startCursor =
      defaultProfile && !this.isProfileCoolingDown(defaultProfile.id)
        ? profiles.indexOf(defaultProfile)
        : lastExternalPoolIndex % profiles.length;
    let triedAny = false;
    let attemptNum = 0;

    for (let i = 0; i < profiles.length; i++) {
      throwIfAborted(effectiveSignal);
      const idx = (startCursor + i) % profiles.length;
      const profile = profiles[idx];
      const cooling = this.isProfileCoolingDown(profile.id);
      if (cooling && !(!triedAny && i === profiles.length - 1)) continue;

      triedAny = true;
      lastExternalPoolIndex = (idx + 1) % profiles.length;
      attemptNum++;

      const label = `${profile.providerType.toUpperCase()} · ${profile.model}`;
      plotDebugLogger.updateAttempt(ctx.logId, {
        model: label,
        apiKey: profile.apiKey,
        keyIndex: idx + 1,
        totalKeys: profiles.length,
        status: 'pending',
        attemptCount: attemptNum,
        phase: `Đang gọi ${profile.name} (${profile.model}) [Provider #${idx + 1}/${profiles.length}]...`
      });

      const reqId = tokenTracker.recordRequestStart(label, 1000, profile.apiKey);
      try {
        const res = await this.invokeGenerateSingle(profile, params, ctx.sendParams, effectiveSignal);
        throwIfAborted(effectiveSignal);
        tokenTracker.recordRequestSuccess(
          reqId,
          res?.usageMetadata?.promptTokenCount || 0,
          res?.usageMetadata?.candidatesTokenCount || 0,
          res?.usageMetadata?.totalTokenCount || 0
        );
        if (ctx.ownsLog) {
          plotDebugLogger.completeSuccess(ctx.logId, {
            fullResponse: ctx.extractText(res),
            usageMetadata: res?.usageMetadata
          });
        }
        return res;
      } catch (err: any) {
        tokenTracker.recordRequestFailure(reqId);
        if (effectiveSignal?.aborted || isAbortError(err)) {
          throw err;
        }
        lastErr = err;
        const safeErrMsg = redactSecrets(String(err?.message || err || ''), [profile.apiKey]);
        if (err?.isQuota || err?.status === 429) {
          this.markProfileRateLimited(profile.id, 25000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            status: 'rate_limit_429',
            phase: `${profile.name} (#${idx + 1}/${profiles.length}) chạm 429 — xoay sang provider tiếp theo...`
          });
          continue;
        }
        if (isTransientProviderError(err)) {
          this.markProfileRateLimited(profile.id, 12000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            phase: `${profile.name} (#${idx + 1}/${profiles.length}) gặp ${err?.status || 503}/quá tải — xoay provider tiếp theo...`
          });
          continue;
        }
        this.markProfileRateLimited(profile.id, 10000);
        plotDebugLogger.updateAttempt(ctx.logId, {
          phase: `${profile.name} (#${idx + 1}/${profiles.length}) gặp lỗi (${safeErrMsg.slice(0, 60)}) — thử provider dự phòng...`
        });
      }
    }
    throw lastErr || new Error('Tất cả Custom AI Provider đang tạm khóa hoặc không khả dụng.');
  },

  async *executeStreamWithPool(
    profiles: ExternalProviderProfile[],
    params: any,
    ctx: {
      logId: string;
      ownsLog: boolean;
      sendParams?: any;
      signal?: AbortSignal;
    }
  ): AsyncGenerator<any, void, unknown> {
    if (profiles.length === 0) {
      throw new Error('Không có Custom AI Provider nào được bật.');
    }

    const effectiveSignal = ctx.signal || getActiveJobAbortContext().signal;
    throwIfAborted(effectiveSignal);

    let lastErr: any = null;
    const defaultProfile = profiles.find(p => p.isDefault);
    const startCursor =
      defaultProfile && !this.isProfileCoolingDown(defaultProfile.id)
        ? profiles.indexOf(defaultProfile)
        : lastExternalPoolIndex % profiles.length;
    let triedAny = false;
    let attemptNum = 0;

    for (let i = 0; i < profiles.length; i++) {
      throwIfAborted(effectiveSignal);
      const idx = (startCursor + i) % profiles.length;
      const profile = profiles[idx];
      const cooling = this.isProfileCoolingDown(profile.id);
      if (cooling && !(!triedAny && i === profiles.length - 1)) continue;

      triedAny = true;
      lastExternalPoolIndex = (idx + 1) % profiles.length;
      attemptNum++;

      const label = `${profile.providerType.toUpperCase()} · ${profile.model}`;
      plotDebugLogger.updateAttempt(ctx.logId, {
        model: label,
        apiKey: profile.apiKey,
        keyIndex: idx + 1,
        totalKeys: profiles.length,
        status: 'pending',
        attemptCount: attemptNum,
        phase: `Đang mở Stream ${profile.name} (${profile.model}) [Provider #${idx + 1}/${profiles.length}]...`
      });

      const reqId = tokenTracker.recordRequestStart(label, 1000, profile.apiKey);
      let yieldedAny = false;
      let fullText = '';
      let finalUsage: any = undefined;

      try {
        for await (const chunk of this.invokeStreamSingle(
          profile,
          params,
          ctx.sendParams,
          (txt) => {
            if (effectiveSignal?.aborted) return;
            fullText += txt;
            if (ctx.ownsLog) {
              plotDebugLogger.updateStreaming(ctx.logId, txt);
            }
          },
          effectiveSignal
        )) {
          throwIfAborted(effectiveSignal);
          if (chunk?.usageMetadata) {
            finalUsage = chunk.usageMetadata;
          }
          if (chunk?.text) {
            yieldedAny = true;
            yield chunk;
          }
        }

        throwIfAborted(effectiveSignal);
        tokenTracker.recordRequestSuccess(
          reqId,
          finalUsage?.promptTokenCount || 0,
          finalUsage?.candidatesTokenCount || 0,
          finalUsage?.totalTokenCount || 0
        );
        if (ctx.ownsLog) {
          plotDebugLogger.completeSuccess(ctx.logId, {
            fullResponse: fullText,
            usageMetadata: finalUsage
          });
        }
        return;
      } catch (err: any) {
        tokenTracker.recordRequestFailure(reqId);
        if (effectiveSignal?.aborted || isAbortError(err)) {
          throw err;
        }
        lastErr = err;
        if (!yieldedAny && (err?.isQuota || err?.status === 429)) {
          this.markProfileRateLimited(profile.id, 25000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            status: 'rate_limit_429',
            phase: `Stream ${profile.name} (#${idx + 1}/${profiles.length}) chạm 429 — xoay provider...`
          });
          continue;
        }
        if (!yieldedAny && isTransientProviderError(err)) {
          this.markProfileRateLimited(profile.id, 12000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            phase: `Stream ${profile.name} (#${idx + 1}/${profiles.length}) gặp ${err?.status || 503}/quá tải — xoay provider...`
          });
          continue;
        }
        if (!yieldedAny) {
          this.markProfileRateLimited(profile.id, 10000);
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error('Tất cả Custom AI Provider đang tạm khóa hoặc gặp lỗi stream.');
  },

  async testProfile(
    profile: ExternalProviderProfile,
    timeoutMs: number = 15000
  ): Promise<ConnectionTestResult> {
    return providerClientService.testConnection(profile, timeoutMs);
  }
};
