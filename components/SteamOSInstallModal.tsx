import React from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SteamOSInstallModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const downloadServerScript = () => {
    const appUrl = window.location.origin;
    const scriptContent = `#!/usr/bin/env bash
# aetheria_steamos_shortcut.sh
# Tạo lối tắt nhanh mở giao diện điều khiển từ xa trỏ tới Steam Deck Server
set -e

APP_URL="${appUrl}"
DESKTOP_DIR="$HOME/Desktop"
DESKTOP_FILE="$DESKTOP_DIR/Aetheria-Remote.desktop"

if flatpak list 2>/dev/null | grep -q com.google.Chrome; then
  BROWSER_CMD="flatpak run com.google.Chrome --app="
elif flatpak list 2>/dev/null | grep -q org.mozilla.firefox; then
  BROWSER_CMD="flatpak run org.mozilla.firefox --kiosk "
else
  BROWSER_CMD="xdg-open "
fi

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Name=Aetheria Studio
Comment=Remote Control UI kết nối Steam Deck Server
Exec=\${BROWSER_CMD}\${APP_URL}
Terminal=false
Type=Application
Categories=Utility;
Icon=applications-internet
EOF

chmod +x "$DESKTOP_FILE"
echo "Đã tạo lối tắt Aetheria Studio tại $DESKTOP_FILE trỏ tới $APP_URL"
`;

    const blob = new Blob([scriptContent], { type: 'text/x-sh' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aetheria_steamos_shortcut.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-700/60 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-blue-900/90 via-slate-900 to-gray-900 p-6 border-b border-gray-800 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-black/30 p-1.5 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <h2 className="text-xl font-bold text-white mb-1">
            Steam Deck Server &amp; Tailscale Remote
          </h2>
          <p className="text-sky-200/80 text-xs">
            Chạy máy chủ 24/7 trên Steam Deck · Điều khiển từ điện thoại, iPad, PC qua Tailscale
          </p>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs text-gray-300">
          <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-1.5">
            <div className="font-bold text-emerald-300">Kiến trúc Máy chủ Trung tâm (Server-Authoritative)</div>
            <p className="text-gray-300 leading-relaxed">
              Mọi tác vụ AI (viết tiếp, Việt hóa, tóm tắt, kiểm toán), kho truyện và API Key đều chạy trực tiếp và lưu trữ bền vững trên Steam Deck (<code className="text-emerald-200">~/aetheria-data</code>). Thoát trình duyệt hay khóa màn hình điện thoại sẽ <b>không làm gián đoạn tác vụ AI</b>.
            </p>
          </div>

          <div className="p-4 bg-gray-950 border border-gray-800 rounded-xl space-y-2.5">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider text-sky-400">
              1. Cài Service chạy ngầm 24/7 trên Steam Deck
            </h3>
            <p className="text-gray-400">
              Mở Konsole trên Steam Deck (Desktop Mode) tại thư mục dự án và chạy lệnh:
            </p>
            <pre className="bg-black/80 border border-gray-800 rounded-lg p-3 font-mono text-[11px] text-sky-300 overflow-x-auto select-all">
{`chmod +x scripts/steamos-setup-server.sh
./scripts/steamos-setup-server.sh`}
            </pre>
            <p className="text-[11px] text-gray-500">
              Service <code className="text-gray-300">aetheria-server</code> dùng <code className="text-gray-300">systemd --user</code> nên không chạm vào phân vùng hệ thống SteamOS khi cập nhật.
            </p>
          </div>

          <div className="p-4 bg-gray-950 border border-gray-800 rounded-xl space-y-2.5">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider text-purple-400">
              2. Mở cổng điều khiển từ điện thoại qua Tailscale
            </h3>
            <ul className="space-y-2 text-gray-300 leading-relaxed">
              <li>
                <b>Cách nhanh (HTTP nội mạng Tailscale):</b> Mở <code className="text-sky-300 font-mono">http://&lt;Tailscale-IP&gt;:3000</code> trên Safari / Chrome điện thoại.
              </li>
              <li>
                <b>Cách khuyên dùng (HTTPS qua Tailscale Serve — hỗ trợ Google Drive OAuth):</b> Chạy 1 lần trên Steam Deck:
                <pre className="mt-1.5 bg-black/80 border border-gray-800 rounded-lg p-2.5 font-mono text-[11px] text-purple-300 overflow-x-auto select-all">
tailscale serve --bg 3000
                </pre>
                Sau đó truy cập bằng tên miền <code className="text-purple-200 font-mono">https://&lt;tên-steamdeck&gt;.&lt;tailnet&gt;.ts.net</code> từ bất kỳ đâu!
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              onClick={downloadServerScript}
              className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-4 rounded-xl transition-colors"
            >
              Tạo Shortcut trên SteamOS Desktop
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold rounded-xl transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
