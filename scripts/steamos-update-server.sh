#!/usr/bin/env bash
set -euo pipefail

# Aetheria Studio — Steam Deck (SteamOS) Quick Update Script
# Cập nhật mã nguồn mà vẫn giữ nguyên toàn bộ dữ liệu tại $HOME/aetheria-data.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$HOME/aetheria-data}"
SERVICE_NAME="aetheria-server.service"

echo "============================================================"
echo "  AETHERIA STUDIO — CẬP NHẬT MÁY CHỦ STEAM DECK"
echo "============================================================"
echo ">> Thư mục mã nguồn : $APP_DIR"
echo ">> Thư mục dữ liệu  : $DATA_DIR (được giữ nguyên 100%)"
echo ""

# 1. Nạp Node.js (nvm / fnm / homebrew / hệ thống)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
fi
export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$HOME/.nvm/versions/node:$(dirname "$(command -v node 2>/dev/null || true)"):/home/linuxbrew/.linuxbrew/bin:$PATH"

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "❌ Chưa tìm thấy Node.js. Vui lòng kiểm tra lại môi trường nvm/node."
  exit 1
fi

cd "$APP_DIR"

# 2. Nếu là Git repo và có remote, tự động kéo code mới (không ghi đè file local chưa commit nếu có xung đột)
if [ -d ".git" ] && git remote get-url origin >/dev/null 2>&1; then
  echo ">> Phát hiện Git repository, đang kiểm tra bản cập nhật mới từ origin..."
  git pull --ff-only || {
    echo "⚠️ Không thể git pull --ff-only tự động (có thay đổi local hoặc xung đột)."
    echo "   Nếu bạn tự giải nén ZIP/chép code mới thủ công, bỏ qua bước này."
  }
else
  echo ">> Không dùng Git remote — tiến hành build từ mã nguồn hiện tại trong $APP_DIR."
fi

# 3. Cài thêm thư viện mới (nếu có) & build lại bản production
echo ">> Đang cài đặt dependencies & build lại giao diện..."
"$NPM_BIN" install
"$NPM_BIN" run build

# 4. Khởi động lại service (hoặc cài mới nếu chưa từng chạy setup)
if systemctl --user list-unit-files "$SERVICE_NAME" 2>/dev/null | grep -q "$SERVICE_NAME"; then
  echo ">> Đang khởi động lại $SERVICE_NAME..."
  systemctl --user daemon-reload
  systemctl --user restart "$SERVICE_NAME"
  echo ""
  echo "✅ CẬP NHẬT HOÀN TẤT!"
  systemctl --user --no-pager status "$SERVICE_NAME" | sed -n '1,12p'
else
  echo "⚠️ Chưa thấy service $SERVICE_NAME, đang chạy lại setup lần đầu..."
  bash "$APP_DIR/scripts/steamos-setup-server.sh"
fi
