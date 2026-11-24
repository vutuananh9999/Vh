import React, { useEffect, useState } from 'react';
import {
  getWebPushStatus,
  sendTestWebPush,
  subscribeWebPush,
  unsubscribeWebPush,
  type WebPushStatus
} from '../services/serviceWorkerRegistration.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeJobCount?: number;
}

export const IPhoneCompanionModal: React.FC<Props> = ({ isOpen, onClose, activeJobCount = 0 }) => {
  const [pushStatus, setPushStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFeedback(null);
    void getWebPushStatus().then(setPushStatus);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTogglePush = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      if (pushStatus?.subscribed) {
        const next = await unsubscribeWebPush();
        setPushStatus(next);
        setFeedback({ type: 'success', text: 'Đã tắt thông báo đẩy trên thiết bị này.' });
      } else {
        const next = await subscribeWebPush('iPhone 13 Pro Max · iOS 18.6.2');
        setPushStatus(next);
        setFeedback({
          type: 'success',
          text: 'Đã bật thông báo nền! Khi thoát ra màn hình chính, bạn sẽ nhận thông báo ngay khi AI chạy xong.'
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Không thể cập nhật quyền thông báo.' });
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await sendTestWebPush();
      setFeedback({
        type: 'success',
        text: `Đã gửi thông báo thử nghiệm tới ${res.sent} thiết bị. Hãy thử vuốt thoát ra màn hình chính iPhone!`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Không thể gửi thông báo thử nghiệm.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-700/70 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
        <div className="bg-gradient-to-r from-sky-950/90 via-slate-900 to-indigo-950/80 p-5 border-b border-gray-800 relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-black/30 p-1.5 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1">
            iPhone 13 Pro Max · iOS 18.6.2 PWA
          </div>
          <h3 className="text-lg font-bold text-white">Chạy Ngầm &amp; Màn Hình Chính</h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Thoát ra Home Screen hoặc khóa máy — tác vụ AI vẫn chạy tiếp trên máy chủ.
          </p>
        </div>

        <div className="p-5 overflow-y-auto ios-scroll space-y-4 text-xs text-gray-300">
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-300">Cơ chế giữ tác vụ khi thoát app</span>
              {activeJobCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200 font-mono text-[10px]">
                  {activeJobCount} đang chạy
                </span>
              )}
            </div>
            <p className="text-gray-300 leading-relaxed">
              iOS 18.6.2 luôn tạm ngưng tab trình duyệt sau vài giây khi bạn vuốt về màn hình chính.
              Vì Aetheria thực thi toàn bộ tác vụ AI trên <b>máy chủ trung tâm</b>, tác vụ sẽ không bị hủy và kết quả sẽ tự đồng bộ ngay khi bạn mở lại biểu tượng ứng dụng.
            </p>
          </div>

          {!pushStatus?.isStandalone && (
            <div className="p-3.5 rounded-xl bg-gray-950 border border-sky-500/30 space-y-2.5">
              <div className="font-bold text-sky-300">
                Cách cài đặt trực tiếp lên Màn hình chính iPhone:
              </div>
              <ol className="space-y-1.5 text-gray-300 list-decimal pl-4 leading-relaxed">
                <li>
                  Mở trang này bằng trình duyệt <b>Safari</b> trên iPhone 13 Pro Max.
                </li>
                <li>
                  Chạm biểu tượng <b>Chia sẻ (Share)</b>{' '}
                  <span className="inline-block px-1.5 py-0.5 rounded bg-gray-800 text-sky-300 font-mono text-[10px]">
                    ↑
                  </span>{' '}
                  ở thanh công cụ dưới cùng.
                </li>
                <li>
                  Cuộn xuống chọn <b>Thêm vào MH chính (Add to Home Screen)</b> → nhấn <b>Thêm</b>.
                </li>
                <li>
                  Mở ứng dụng từ biểu tượng <b>Aetheria</b> trên Màn hình chính (chế độ toàn màn hình không thanh Safari).
                </li>
              </ol>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-white">Thông báo đẩy khi xong tác vụ (iOS 18.6.2)</div>
                <div className="text-[11px] text-gray-400">
                  {pushStatus?.requiresHomeScreenInstall
                    ? 'Cần mở app từ biểu tượng Màn hình chính để bật Web Push.'
                    : pushStatus?.subscribed
                    ? 'Đang bật — iPhone sẽ nhận thông báo + huy hiệu (Badge) kể cả khi thoát app.'
                    : 'Bật để nhận cảnh báo màn hình khóa ngay khi viết/tóm tắt/kiểm toán xong.'}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  pushStatus?.subscribed
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {pushStatus?.subscribed ? 'ĐÃ BẬT' : 'CHƯA BẬT'}
              </span>
            </div>

            {feedback && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
                  feedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                    : 'bg-red-950/40 border-red-500/30 text-red-200'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || Boolean(pushStatus?.requiresHomeScreenInstall)}
                onClick={handleTogglePush}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition-colors disabled:opacity-40 ${
                  pushStatus?.subscribed
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                {busy
                  ? 'Đang xử lý...'
                  : pushStatus?.subscribed
                  ? 'Tắt thông báo nền'
                  : 'Bật thông báo iOS'}
              </button>

              {pushStatus?.subscribed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSendTest}
                  className="py-2 px-3 rounded-lg font-bold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-40"
                >
                  Thử thông báo
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
