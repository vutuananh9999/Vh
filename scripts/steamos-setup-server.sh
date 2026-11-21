#!/usr/bin/env bash
set -euo pipefail

# Aetheria Studio — Steam Deck (SteamOS) 24/7 Server + Tailscale Setup Script
# Cài đặt và chạy Aetheria liên tục dưới nền như một service người dùng (không cần root/steamos-readonly disable).

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$HOME/aetheria-data}"
PORT="${PORT:-3000}"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/aetheria-server.service"

echo "============================================================"
echo "  AETHERIA STUDIO — STEAM DECK 24/7 SERVER SETUP"
echo "============================================================"
echo ">> Thư mục mã nguồn : $APP_DIR"
echo ">> Thư mục dữ liệu  : $DATA_DIR"
echo ">> Cổng HTTP        : $PORT"
echo ""

# 1. Tìm Node.js (>= 18) trong hệ thống hoặc nvm / fnm / homebrew
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
fi
export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$HOME/.nvm/versions/node:$(dirname "$(command -v node 2>/dev/null || true)"):/home/linuxbrew/.linuxbrew/bin:$PATH"

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "❌ Chưa tìm thấy Node.js trên Steam Deck."
  echo "Hãy cài Node.js 20+ bằng nvm (không chạm vào phân vùng hệ thống SteamOS):"
  echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "  nvm install 20 && nvm use 20"
  exit 1
fi

NODE_DIR="$(dirname "$NODE_BIN")"
echo "✅ Đã phát hiện Node: $($NODE_BIN -v) tại $NODE_BIN"

# 2. Cài dependencies và build giao diện tối ưu
mkdir -p "$DATA_DIR"
chmod 700 "$DATA_DIR"

cd "$APP_DIR"
echo ">> Đang cài thư viện & build ứng dụng..."
npm install
npm run build

# 3. Tạo systemd user service để chạy 24/7 (tự khởi động cùng máy & không tắt khi đóng trình duyệt)
mkdir -p "$SERVICE_DIR"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Aetheria Studio Authoritative Server (Steam Deck)
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
Environment=DATA_DIR=$DATA_DIR
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
ExecStart=$NPM_BIN run start
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

echo ">> Đang kích hoạt service systemd --user..."
systemctl --user daemon-reload
systemctl --user enable --now aetheria-server.service

# Bật linger để service chạy ngay cả khi chưa login desktop (nếu systemd hỗ trợ)
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER" 2>/dev/null || true
fi

# 4. Hiển thị địa chỉ Tailscale & hướng dẫn HTTPS
TS_IP=""
TS_DNS=""
if command -v tailscale >/dev/null 2>&1; then
  TS_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  TS_DNS="$(tailscale status --json 2>/dev/null | "$NODE_BIN" -e '
    const fs = require("fs");
    try {
      const s = JSON.parse(fs.readFileSync(0, "utf8"));
      const dns = (s.Self && s.Self.DNSName) ? s.Self.DNSName.replace(/\.$/, "") : "";
      if (dns) console.log(dns);
    } catch {}
  ' || true)"
fi

echo ""
echo "============================================================"
echo "  ✅ CÀI ĐẶT HOÀN TẤT — MÁY CHỦ ĐANG CHẠY 24/7"
echo "============================================================"
echo "1. Kiểm tra trạng thái : systemctl --user status aetheria-server"
echo "2. Xem log trực tiếp   : journalctl --user -u aetheria-server -f"
echo "3. Dữ liệu an toàn tại : $DATA_DIR"
echo ""
if [ -n "$TS_IP" ]; then
  echo "📱 Truy cập qua Tailscale IP (HTTP):"
  echo "   http://$TS_IP:$PORT"
fi
if [ -n "$TS_DNS" ]; then
  echo "🔒 Bật HTTPS (Khuyên dùng cho Google Drive Sync & Bảo mật trên iPhone/Android):"
  echo "   tailscale serve --bg $PORT"
  echo "   Sau đó mở trên điện thoại: https://$TS_DNS"
else
  echo "🔒 Nếu muốn bật HTTPS qua Tailscale để dùng Google Drive Sync trên điện thoại:"
  echo "   tailscale serve --bg $PORT"
fi
echo "============================================================"
