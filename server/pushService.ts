import { createRequire } from 'node:module';
import type webPushModule from 'web-push';
import { serverVault, type PushSubscriptionRecord } from './serverVault.ts';
import type { ServerJobState } from '../services/runtimeAdapter.ts';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof webPushModule;

class ServerPushService {
  private initialized = false;
  private publicKey = '';

  private ensureInitialized(): void {
    if (this.initialized) return;

    let keys = serverVault.getVapidKeys();
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      serverVault.setVapidKeys(keys);
    }

    this.publicKey = keys.publicKey;
    webpush.setVapidDetails('mailto:aetheria@local.app', keys.publicKey, keys.privateKey);
    this.initialized = true;
  }

  public getPublicKey(): string {
    this.ensureInitialized();
    return this.publicKey;
  }

  public getSubscriptionCount(): number {
    return serverVault.getPushSubscriptions().length;
  }

  public subscribe(input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
    deviceLabel?: string;
  }): number {
    this.ensureInitialized();
    if (!input?.endpoint || !input?.keys?.p256dh || !input?.keys?.auth) {
      throw new Error('Thông tin đăng ký Web Push không hợp lệ.');
    }
    const list = serverVault.upsertPushSubscription({
      endpoint: String(input.endpoint),
      keys: {
        p256dh: String(input.keys.p256dh),
        auth: String(input.keys.auth)
      },
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 300) : undefined,
      deviceLabel: input.deviceLabel ? String(input.deviceLabel).slice(0, 120) : undefined,
      createdAt: Date.now()
    });
    return list.length;
  }

  public unsubscribe(endpoint: string): number {
    if (!endpoint) return this.getSubscriptionCount();
    const list = serverVault.removePushSubscription(endpoint);
    return list.length;
  }

  public async sendToAll(payload: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    jobId?: string;
    storyId?: string;
    chapterId?: string;
    status?: string;
    badgeCount?: number;
  }): Promise<{ sent: number; failed: number }> {
    this.ensureInitialized();
    const subs = serverVault.getPushSubscriptions();
    if (subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const bodyJson = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;

    await Promise.all(
      subs.map(async (sub: PushSubscriptionRecord) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            bodyJson,
            { TTL: 3600, urgency: 'high' }
          );
          sent++;
        } catch (err: any) {
          failed++;
          const statusCode = err?.statusCode;
          // Prune permanently expired/unsubscribed Apple/Chrome endpoints
          if (statusCode === 404 || statusCode === 410) {
            serverVault.removePushSubscription(sub.endpoint);
          }
        }
      })
    );

    return { sent, failed };
  }

  public async sendJobNotification(job: ServerJobState, unacknowledgedCount = 1): Promise<void> {
    if (job.status !== 'completed' && job.status !== 'failed') return;
    if (this.getSubscriptionCount() === 0) return;

    const isDone = job.status === 'completed';
    const title = isDone ? `✅ Hoàn tất: ${job.title}` : `⚠️ Lỗi tác vụ: ${job.title}`;
    const body = isDone
      ? job.statusText || 'Tác vụ AI trên máy chủ đã xử lý xong. Nhấn để mở xem kết quả.'
      : job.error || job.statusText || 'Tác vụ AI gặp sự cố. Nhấn để kiểm tra.';

    await this.sendToAll({
      title,
      body: body.slice(0, 220),
      tag: `job-${job.id}`,
      url: '/',
      jobId: job.id,
      storyId: job.storyId,
      chapterId: job.chapterId,
      status: job.status,
      badgeCount: Math.max(1, unacknowledgedCount)
    });
  }
}

export const pushService = new ServerPushService();
