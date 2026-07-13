import React, { useState } from 'react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const SteamOSInstallModal: React.FC<Props> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const downloadScript = () => {
        const appUrl = window.location.origin;
        const scriptContent = `#!/bin/bash
# install_aetheria_steamos.sh
# Script cài đặt tự động 1 chạm cho Steam Deck / SteamOS

echo "============================================="
echo "   CÀI ĐẶT AETHERIA CHO STEAMOS/STEAM DECK"
echo "============================================="
echo ""

APP_URL="${appUrl}"
DESKTOP_DIR="$HOME/Desktop"
DESKTOP_FILE="$DESKTOP_DIR/Aetheria.desktop"

# Kiểm tra trình duyệt (Chrome ưu tiên để tạo standalone app)
if flatpak list 2>/dev/null | grep -q com.google.Chrome; then
    BROWSER_CMD="flatpak run com.google.Chrome"
    APP_FLAG="--app="
elif flatpak list 2>/dev/null | grep -q org.mozilla.firefox; then
    BROWSER_CMD="flatpak run org.mozilla.firefox"
    APP_FLAG="--kiosk "
else
    echo "Cảnh báo: Không tìm thấy Chrome hay Firefox bản Flatpak. Sẽ dùng mặc định."
    BROWSER_CMD="xdg-open"
    APP_FLAG=""
fi

echo ">> Đang tạo lối tắt..."
cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Name=Aetheria
Comment=Kiến Trúc Sư Cốt Truyện AI
Exec=$BROWSER_CMD $APP_FLAG$APP_URL
Terminal=false
Type=Application
Categories=Utility;Game;
Icon=applications-internet
EOF

chmod +x "$DESKTOP_FILE"

echo ">> Đã tạo thành công lối tắt [ Aetheria ] nằm ngay trên Desktop!"
echo ""
echo "==== HƯỚNG DẪN ĐƯA VÀO GAMING MODE ===="
echo "1. Mở ứng dụng Steam (trên Desktop Mode)"
echo "2. Góc dưới bên trái, chọn 'Add a Game' -> 'Add a Non-Steam Game'"
echo "3. Ấn 'Browse...' và tìm đến thư mục Desktop, chọn file Aetheria.desktop"
echo "4. Ấn 'Add Selected Programs'"
echo "======================================="
echo ""
read -p ">> Mọi thứ đã hoàn tất! Nhấn Enter để đóng..."`;

        const blob = new Blob([scriptContent], { type: 'text/x-sh' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'install_aetheria_steamos.sh';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-0 w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col">
                
                {/* Header Graphic */}
                <div className="bg-gradient-to-r from-blue-900 to-gray-900 p-6 border-b border-gray-800 relative overflow-hidden text-center">
                    <svg className="absolute w-64 h-64 text-blue-500/10 -top-10 -right-10 transform rotate-12" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21.94 13.11l-1.04-1.8c-.85-1.47-2.61-2.09-4.22-1.3l-1.46.73c-1.42.71-3.13.14-3.84-1.28l-1.12-2.22c-.59-1.2-1.79-1.96-3.12-1.96h-1c-.53 0-1.06-.42-1.2-1-.24-1.04-.6-2.03-1.06-2.94-.5-1-1.63-1.52-2.72-1.25l-.26.06c-.8.19-1.59-.1-2.08-.77l-.6-.82A3 3 0 0 0 1.25.16L0 2.94l.84 1.15c.67.92 1.83 1.22 2.91.75l.13-.06c.96-.44 2.1-.06 2.58.91.4.81.7 1.68.89 2.59.18 1 .84 1.74 1.78 1.98h1.22c.67 0 1.3.36 1.63.95l1.01 1.81c.54.97 1.58 1.48 2.66 1.3l.53-.09c.92-.15 1.86.32 2.3 1.16l1.23 2.37c.48.91 1.44 1.47 2.47 1.47h2c.86 0 1.69-.47 2.1-1.24l.55-.95a2.5 2.5 0 0 0-.89-3.41z"/>
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors bg-black/30 p-1.5 rounded-full z-10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <h2 className="text-2xl font-bold text-white relative z-10 block mb-2 drop-shadow-md">
                        SteamOS / Steam Deck Installer
                    </h2>
                    <p className="text-blue-200 text-sm relative z-10">Cài đặt Aetheria làm ứng dụng độc lập 1 chạm</p>
                </div>

                <div className="p-6 space-y-6">
                    <p className="text-sm text-gray-300 leading-relaxed text-center">
                        Để cài đặt và chạy ứng dụng này trên Steam Deck của bạn mượt mà nhất với chế độ toàn màn hình, hãy tải và chạy tệp Script cài đặt tự động.
                    </p>

                    <div className="bg-gray-850 p-5 rounded-xl border border-gray-800 shadow-inner space-y-4 relative">
                        <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                            <svg className="w-16 h-16 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11 2v20c-5.07-.5-9-4.79-9-10s3.93-9.5 9-10zm2 0v20c5.07-.5 9-4.79 9-10s-3.93-9.5-9-10zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                            </svg>
                        </div>
                        
                        <h3 className="font-bold text-gray-200 flex items-center gap-2">
                            <span className="bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-md text-xs border border-blue-500/30">QUY TRÌNH BA BƯỚC</span>
                        </h3>
                        <ol className="list-decimal pl-5 space-y-3 text-sm text-gray-400 mb-2">
                            <li>Vào <strong>Desktop Mode</strong> trên Steam Deck.</li>
                            <li>Bấm nút tải Script bên dưới.</li>
                            <li>Bấm đúp chuột vào file <code>install_aetheria_steamos.sh</code> vừa tải và chọn <strong className="text-blue-400">Execute</strong> (Hoặc Run).</li>
                        </ol>
                        
                        <div className="bg-gray-950 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-500 flex items-start gap-2">
                            <svg className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>Script này hoàn toàn mã nguồn mở và an toàn, chỉ tạo màn hình Desktop Shortcut sử dụng Google Chrome (Flatpak) ở chế độ Kiosk Mode.</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button onClick={downloadScript} className="w-full bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 border border-blue-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:-translate-y-0.5 flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            TẢI VỀ STEAMOS SCRIPT (.sh)
                        </button>
                        <button onClick={onClose} className="w-full px-5 py-3 text-gray-400 hover:text-white hover:bg-gray-800 font-bold rounded-xl transition-colors">
                            Đóng cửa sổ
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
