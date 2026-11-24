# Hướng Dẫn Build, Ký & Xuất File `.ipa` Cho Aetheria (iOS Độc Lập)

Dự án đã được chuyển đổi sang cấu trúc **Dual-Mode (Web/Express + Standalone iOS App)**:
- **Chạy độc lập trên iPhone/iPad** (`capacitor://localhost`): toàn bộ AI Jobs, Context/World Bible Engine, Token Tracking, Throttling, Debug Logger, mã hóa API Key (`Web Crypto AES-GCM` + `Capacitor Preferences`) và lưu trữ truyện (`IndexedDB`) chạy trực tiếp trên thiết bị, không cần Node.js server.
- **Tương thích hoàn toàn với chế độ máy chủ Web** (`npm run dev` / `npm start` trên cổng `3000`).

---

## 1. Yêu cầu trên máy macOS build `.ipa`
- **macOS** + **Xcode 15 trở lên** (khuyến nghị Xcode 16+, iOS SDK 18+).
- **Node.js >= 20** & **npm**.
- Tài khoản **Apple Developer** (miễn phí nếu cài trực tiếp qua Xcode bằng Development Team, hoặc trả phí $99/năm để xuất `.ipa` phân phối Ad-Hoc / TestFlight / App Store / Sideload).
- **Lưu ý**: Project dùng **Swift Package Manager (`CapApp-SPM`)** của Capacitor 8, nên **KHÔNG cần chạy `pod install` (CocoaPods)**. Khi mở Xcode, Xcode tự tải `capacitor-swift-pm`.

---

## 2. Quy trình build từ mã nguồn sang Xcode

Trên máy macOS, mở Terminal tại thư mục gốc dự án:

```bash
# 1. Cài dependencies (nếu mới clone/tải zip về macOS)
npm install

# 2. Build bản standalone (tự động tắt nhúng GEMINI_API_KEY từ .env) & đồng bộ sang iOS
npm run build:ios

# 3. Mở project Xcode
npm run ios:open
```

*(Lệnh `npm run build:ios` chạy `VITE_STANDALONE=1 vite build && npx cap sync ios` để copy toàn bộ bundle HTML/JS/CSS/Icons vào `ios/App/App/public/`.)*

---

## 3. Ký (Signing) và Xuất `.ipa` bằng Xcode (Khuyến nghị)

1. Sau khi Xcode mở `ios/App/App.xcodeproj`, chọn **App** ở cây thư mục trái → chọn Target **App** → tab **Signing & Capabilities**.
2. Kiểm tra:
   - **Bundle Identifier**: đang đặt là `com.vhok.aetheria` (bạn có thể đổi thành ID riêng nếu trùng trên Apple ID của bạn, ví dụ `com.yourname.aetheria`).
   - Tích chọn **Automatically manage signing** và chọn **Team** (Apple ID / Apple Developer Team của bạn).
3. Ở thanh chọn thiết bị phía trên cùng Xcode, chọn **Any iOS Device (arm64)** (lưu ý: không chọn Simulator nếu muốn Archive thành `.ipa`).
4. Vào menu trên cùng: **Product → Archive**.
5. Khi cửa sổ **Organizer** hiện ra sau khi Archive xong:
   - Nhấn **Distribute App**.
   - Chọn hình thức phân phối phù hợp:
     - **Release Testing / Ad-Hoc** hoặc **Development**: xuất ra file `.ipa` cài trực tiếp lên các iPhone đã đăng ký UDID.
     - **App Store Connect**: đẩy lên TestFlight / App Store.
     - **Debugging** / **Custom**: xuất `.ipa` tự ký hoặc tái ký bằng công cụ sideload (AltStore / Sideloadly / Feather).
   - Nhấn **Next** → **Export** để lưu thư mục chứa `Aetheria.ipa`.

---

## 4. Hoặc Build & Xuất `.ipa` bằng dòng lệnh (`xcodebuild`)

```bash
# Đảm bảo đã đồng bộ bản build mới nhất
npm run build:ios

# Archive project (SPM tự resolve package)
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/Aetheria.xcarchive \
  -allowProvisioningUpdates \
  archive

# Tạo ExportOptions.plist (ví dụ ad-hoc, thay YOUR_TEAM_ID bằng Team ID thật)
cat << 'EOF' > build/ExportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>ad-hoc</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>YOUR_TEAM_ID</string>
</dict>
</plist>
EOF

# Xuất file .ipa
xcodebuild -exportArchive \
  -archivePath build/Aetheria.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist \
  -exportPath build/ipa \
  -allowProvisioningUpdates
```

File `.ipa` sẽ nằm trong `build/ipa/App.ipa`.

---

## 5. Lưu ý sử dụng trên iOS
- **API Key**: Vào **Cài đặt Hệ thống / Quản lý AI Provider** ngay trong app trên iPhone để nhập Gemini API Key hoặc Custom OpenAI-compatible / Claude / Ollama URL. Key được mã hóa lưu cục bộ trên máy (`IndexedDB` + `Capacitor Preferences`), không bao giờ đóng gói vào file `.ipa`.
- **Xuất / Sao lưu dữ liệu**: Các chức năng xuất `.epub`, `.txt`, và `.json` backup sẽ mở **iOS Share Sheet** gốc để bạn lưu trực tiếp vào **Files / iCloud Drive / AirDrop**.
- **Google Drive Sync**: OAuth popup bị giới hạn trong `WKWebView` iOS; vui lòng dùng tính năng **Xuất JSON Backup -> Lưu vào iCloud Drive / Files** để sao lưu và chuyển dữ liệu giữa các thiết bị.
