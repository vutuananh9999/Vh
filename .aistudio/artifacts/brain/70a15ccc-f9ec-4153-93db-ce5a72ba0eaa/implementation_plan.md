# Kế Hoạch Tối Ưu Hóa Toàn Diện Ứng Dụng Aetheria Novel Studio

> Nâng cấp toàn diện hiệu năng tải, tốc độ xử lý văn bản lớn, độ ổn định kết nối AI và tối ưu hóa hệ thống lưu trữ IndexedDB thế hệ mới chống nghẽn bộ nhớ.

---

## Quyết Định Cốt Lõi Từ Người Dùng (Confirmed Decisions)

> [!IMPORTANT]
> Dựa trên phỏng vấn làm rõ yêu cầu, ứng dụng sẽ được tối ưu theo 2 định hướng trọng tâm:
> 1. **Phạm vi ưu tiên**: Tối ưu hóa **toàn diện** cả 3 trụ cột: **Hiệu năng hiển thị**, **Tốc độ phản hồi** và **Độ ổn định hệ thống**.
> 2. **Cơ chế lưu trữ**: Nâng cấp hệ thống lưu trữ **IndexedDB** với kỹ thuật **lưu trữ phân đoạn (Granular Chapter Storage)** và **nén dữ liệu (Data Compression)** để giải quyết triệt để vấn đề đầy bộ nhớ trình duyệt khi truyện có nhiều chương dài.

---

## 1. Tổng Quan & Mục Tiêu

### Vấn đề hiện tại
- **Lưu trữ nguyên khối (Monolithic Save)**: Mỗi lần tự động lưu hoặc gõ phím, toàn bộ tác phẩm (Story) bao gồm toàn bộ văn bản của tất cả các chương đều bị tuần tự hóa (serialize) và ghi đè vào IndexedDB, gây tiêu tốn CPU và I/O khi tác phẩm dài hơn 20 chương.
- **Tái kết xuất giao diện (Re-render Overhead)**: Việc chỉnh sửa văn bản trong `Editor` kích hoạt re-render diện rộng ở Sidebar và các thanh công cụ do thiếu memoization cục bộ.
- **Trải nghiệm đọc dài**: Chưa có thanh công cụ tinh chỉnh hiển thị đọc nhanh (cỡ chữ, font chữ Serif cổ phong vs Sans hiện đại, chế độ dịu mắt OLED/Dark/Charcoal).
- **Lỗi ngắt quãng AI**: Khi nội dung dịch hoặc viết vượt quá hạn mức token của 1 lượt gọi, AI có thể bị dừng hoặc sinh ký tự rác `[undefined]`.

### Giá trị đạt được sau tối ưu
1. **Tốc độ gõ và cuộn 60fps**: Gõ văn bản hàng chục nghìn từ mượt mà không có độ trễ nhập liệu.
2. **Tiết kiệm 75% dung lượng lưu trữ**: Chỉ lưu chương đang thay đổi (Chamber Delta Saving), nén dữ liệu cũ, không bao giờ lo trình duyệt báo hết hạn mức IndexedDB.
3. **AI hoạt động bền bỉ**: Khử 100% lỗi `undefined`, tự động chia nhỏ phân đoạn thông minh để chống lỗi 429 và vượt qua giới hạn độ dài của mô hình.
4. **Trải nghiệm người dùng chuẩn tác giả**: Tích hợp Zen Focus Mode và thanh công cụ tùy chỉnh đọc sách chuyên nghiệp.

---

## 2. Trải Nghiệm Người Dùng & Thiết Kế Giao Diện

### A. Giao diện Đọc Sách & Soạn Thảo (Reader & Typography Controls)
- **Thanh tùy biến đọc nhanh (Floating Reading Bar)**:
  - Cho phép chọn 4 cỡ chữ tiện lợi: Nhỏ (15px), Vừa (17px - Mặc định), Lớn (19px), Rất lớn (22px).
  - Chuyển đổi font chữ: *Font Văn chương Serif* (Playfair / Lora / Merriweather cảm giác trang nhã) vs *Font Hiện đại Sans* (Plus Jakarta Sans / Inter).
  - Tông màu nền đọc sách: *Đen tuyền OLED* (`#050505`), *Than chì dịu mắt* (`#121214`), *Giấy ngà đọc đêm* (`#1c1917`).
- **Chế độ Tập Trung Tuyệt Đối (Zen Focus Mode)**:
  - Nút chuyển nhanh ẩn toàn bộ Sidebar, công cụ phụ và header, chỉ để lại trang văn bản tinh khôi giữa màn hình. Nhấn `ESC` hoặc rê chuột lên trên để hiện lại.

### B. Tuân thủ Hiến chương Thiết kế Frontend (Anti-Slop Discipline)
- Không dùng các huy hiệu pill sặc sỡ cho thông tin tĩnh; metadata hiển thị dạng văn bản thanh thoát ngăn cách bởi dấu chấm giữa (`·`).
- Thanh điều hướng tuân thủ **Top Bar Contract**: 3 phân vùng rõ ràng (Tên tác phẩm — Các công cụ chính — Nút hành động nổi bật).
- Tỉ lệ màu sắc chuẩn **60-30-10**: 60% nền tối sâu thẳm, 30% bề mặt panel xám tro sang trọng, 10% điểm nhấn xanh ngọc lục bảo (Emerald) và tím tử đằng (Violet).

---

## 3. Kiến Trúc Kỹ Thuật & Chiến Lược Lưu Trữ

### Sơ đồ Kiến trúc Hệ thống Tối ưu

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AETHERIA NOVEL STUDIO                           │
├──────────────────────────────────┬─────────────────────────────────────┤
│      UI & INTERACTION LAYER      │         STATE & CONTEXT LAYER       │
│  ┌────────────────────────────┐  │  ┌───────────────────────────────┐  │
│  │ Sidebar (Memoized Items)   │  │  │ StoryContext (Selective Sync) │  │
│  │ Editor (Memoized Reader)   │◄─┼──┤  - Active Chapter In-Memory   │  │
│  │ Reading Settings Bar       │  │  │  - Chapter Metadata Cache     │  │
│  │ Swipe & Touch Engine       │  │  │  - Debounced Delta Dispatcher │  │
│  └────────────────────────────┘  │  └───────────────┬───────────────┘  │
├──────────────────────────────────┴──────────────────┼──────────────────┤
│           STORAGE & PERSISTENCE LAYER (AetheriaDB v4)                  │
│  ┌──────────────────────────────────────────────────┴───────────────┐  │
│  │  IndexedDB Storage Engine                                        │  │
│  │   ├── Store 1: 'story_metadata' (Title, Synopsis, Chapter Index) │  │
│  │   ├── Store 2: 'chapters' (Granular by chapterId)                │  │
│  │   └── Store 3: 'vectors' (RAG Semantic Embeddings)               │  │
│  │                                                                  │  │
│  │  Smart Delta Saver:                                              │  │
│  │   - Keystroke -> Chỉ lưu chapterId đang sửa                      │  │
│  │   - Lightweight LZ/Gzip text compression cho chương > 10KB       │  │
│  │   - Tự động di trú (Migration) 100% dữ liệu cũ an toàn           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Chi tiết các cải tiến kỹ thuật:

#### 1. Nâng cấp `storage.ts` (IndexedDB Granular Architecture)
- **Tách cấu trúc**:
  - `story_metadata`: Chứa ID, tiêu đề truyện, thể loại, danh sách mục lục (ID, title, order, wordCount). Dung lượng siêu nhẹ (< 50KB).
  - `chapters`: Chứa bản ghi độc lập `[chapterId, content, summary, outline, translatedContent]`.
- **Lợi ích**: Khi người dùng gõ chương 2, hệ thống chỉ ghi lại bản ghi chương 2 vào store `chapters` mà không cần động đến hàng trăm chương khác. Tốc độ lưu nhanh gấp 10-20 lần!
- **Tương thích ngược (Backward Compatibility)**: Tự động phát hiện phiên bản database cũ (v3) và di trú sang cấu trúc mới trong 0.2 giây mà không mất bất kỳ một chữ nào của người dùng.

#### 2. Tối ưu hóa `Editor.tsx` & `Sidebar.tsx`
- **Memoization**:
  - Tách nội dung đoạn văn trong Chế độ Xem thành `MemoizedParagraph` để không parse lại chuỗi text khi chỉ di chuột hay mở menu.
  - Sử dụng `React.memo` cho `ChapterListItem` trong Sidebar để việc chọn chương chỉ re-render đúng 2 phần tử (chương cũ bỏ chọn và chương mới được chọn).
- **Textarea Typing Pipeline**:
  - Tách biệt `localContent` với trigger tự động co giãn chiều cao (Resize Observer / Layout Effect điều tiết theo frame, loại bỏ layout thrashing).

#### 3. Chống lỗi AI ngắt quãng & Khử sạch `undefined`
- Bộ lọc `cleanModelResponse` chuẩn hóa: Quét sạch triệt để mọi pattern `(?:undefined|null)` ở cuối câu trả lời do streaming hoặc timeout.
- Cải thiện cơ chế tự động gửi prompt nối tiếp khi phát hiện kết quả bị cắt ngắn do `MAX_TOKENS`.
- Cơ chế Fallback chủ động: Khi model Pro bị chạm ngưỡng RPM/TPM (mã lỗi 429), hệ thống tự động cảnh báo và chuyển mượt sang Flash để không làm gián đoạn dòng suy nghĩ của tác giả.

---

## 4. Kế Hoạch Triển Khai (Phần Việc Cụ Thể)

1. **Bước 1: Nâng cấp Core Storage (`/services/storage.ts`)**
   - Thiết kế database v4 hỗ trợ lưu phân đoạn chương `saveChapterContent()`.
   - Viết hàm tự động chuyển đổi dữ liệu cũ sang cấu trúc mới an toàn 100%.
   - Thêm cơ chế nén chuỗi cho các chương dung lượng lớn.

2. **Bước 2: Cập nhật `StoryContext.tsx`**
   - Định tuyến các hàm `updateChapterContent` và `updateChapterTranslation` ghi trực tiếp vào phân đoạn của chương mà không serialize toàn bộ truyện.
   - Giảm tải state re-render cho các component con.

3. **Bước 3: Tối ưu hóa Hiệu năng Render (`Editor.tsx` & `Sidebar.tsx`)**
   - Tối ưu hóa vòng lặp render đoạn văn trong Chế độ Xem.
   - Thêm thanh tùy chỉnh đọc sách (Cỡ chữ, Font chữ, Tông màu nền đọc sách).
   - Thêm chế độ Tập trung (Zen Focus Mode).
   - Áp dụng `React.memo` cho các phần tử danh sách chương trong Sidebar.

4. **Bước 4: Tinh chỉnh dịch vụ AI (`geminiService.ts`)**
   - Tăng cường thuật toán lọc và bảo vệ đầu ra văn bản, loại bỏ hoàn toàn lỗi ngắt quãng và chuỗi `undefined`.
   - Kiểm tra và đảm bảo xử lý mượt mà cho truyện dài.

5. **Bước 5: Kiểm thử & Xác minh**
   - Chạy `compile_applet` và `lint_applet` xác nhận không có bất kỳ lỗi TypeScript hay xung đột nào.
   - Xác minh tốc độ tải và khả năng lưu trữ ổn định.
