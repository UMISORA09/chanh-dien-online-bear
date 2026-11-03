# Chánh Điện Tịnh Tâm · Bear (Bản Nâng Cấp Toàn Diện)

Chánh điện online 2.5D cho TikTok LIVE & Web tu tập cá nhân. Mỗi người xem bình luận là bước vào chánh điện, ngồi xuống bồ đoàn tụng kinh. Ai tặng quà sẽ được xướng tên hồi hướng bằng giọng đọc tiếng Việt mượt mà. Hệ thống tích hợp âm thanh Đại Hồng Chung, chuông bát, mõ gỗ mít và tự động tụng kinh định kỳ.

Đây là bản fork/rebrand do **Bear** duy trì, dựa trên dự án gốc [kentjuno/chanh-dien-online](https://github.com/kentjuno/chanh-dien-online). Bản fork giữ lại giấy phép MIT và ghi nhận bản quyền của tác giả gốc.

Mã nguồn chia sẻ miễn phí (MIT) gồm các thành phần:

| Thư mục / Tệp | Chức năng |
|---|---|
| `index.html`, `assets/` | Bản web tu tập trực tuyến cho mọi người tự an tọa, gõ mõ, thỉnh chuông, gửi lời nguyện cầu an |
| `live/overlay.html` | Màn hình Overlay dọc 9:16 chuẩn Studio/OBS (1080×1920) với hiệu ứng hào quang, khói hương, hoa rơi, xướng tên công đức |
| `live/control.html` | Bảng điều khiển Studio chuyên nghiệp: Bàn mixer 5 đường âm lượng, soundboard chuông mõ, kho 6 bài kinh tụng |
| `live/server.mjs` | Máy chủ Node.js: kết nối TikTok LIVE tự phục hồi (auto-reconnect), lưu bảng công đức (`merit.json`), TTS Edge tiếng Việt |

---

## Tính Năng Mới Trong Bản Nâng Cấp Toàn Diện

- **Hệ thống âm thanh Web Audio đỉnh cao**:
  - **Đại Hồng Chung (Chuông U Minh)**: Họa âm trầm ấm, ngân vang kéo dài tự nhiên.
  - **Chuông Bát / Gia Trì**: Âm trong trẻo, đánh thức tâm thức tĩnh lặng.
  - **Mõ gỗ mít**: Mô phỏng khoang rỗng buồng gỗ và tiếng gõ tự nhiên, chỉnh được BPM.
  - **Khánh đồng**: Âm thanh trong vắt thanh tịnh.
- **Bàn Mixer Âm Lượng 5 kênh trên Bảng Điều Khiển**: Tùy chỉnh độc lập Master, Nhạc thiền, Tiếng mõ, Tiếng chuông và Giọng đọc TTS.
- **Tự động phục hồi kết nối TikTok (Auto-Reconnect)**: Khi mạng bị ngắt quãng, server tự động thử kết nối lại với thuật toán Exponential Backoff.
- **Bảng Công Đức bền vững (`live/merit.json`)**: Tự động lưu trữ điểm công đức của Phật tử theo thời gian thực; khởi động lại máy chủ không bị mất điểm. Có nút làm mới an toàn.
- **Kho bài kinh tụng định kỳ phong phú**:
  - Hồi Hướng Công Đức
  - Phát Nguyện Vãng Sanh
  - Tâm Kinh Bát Nhã
  - Đại Bi Thần Chú
  - Sám Hối Hồng Danh
  - Dược Sư Cầu An
- **Tương tác trên Bản Web tĩnh**: Người dùng có thể trực tiếp chọn 6 loại y phục (Nam áo lam, Nữ áo lam, Áo nâu, Chư Tăng, Chư Ni, Chú tiểu), tự gõ mõ, thỉnh chuông và gửi lời nguyện cầu an hiển thị bong bóng chat.
- **Tối ưu hình ảnh & hiệu năng**: Hào quang Đức Phật chuyển động theo nhịp thở và rung rinh khi thỉnh chuông; ánh nến bập bùng, khói trầm hương uốn lượn; loại bỏ các đoạn mã quảng cáo thừa.

---

## Khởi Chạy Nhanh Trên Windows

Chỉ cần nhấp đúp tệp **`run.bat`** ở thư mục gốc:
- Tự động kiểm tra Node.js & npm (yêu cầu Node 20 trở lên).
- Tự động cài đặt dependency nếu chạy lần đầu.
- Khởi động toàn bộ máy chủ và tự động mở trình duyệt:
  - Bảng điều khiển: `http://localhost:3000/live/control.html`
  - Web tu tập: `http://localhost:3000/index.html`

---

## Hướng Dẫn Phát Trực Tiếp (Livestream TikTok)

1. Mở Bảng điều khiển tại `http://localhost:3000/live/control.html`.
2. Bấm nút **"Mở màn hình overlay 9:16"**.
3. Trong cửa sổ Overlay vừa mở, bấm **"🔔 Bấm để bật âm thanh LIVE"** một lần duy nhất (để trình duyệt cấp quyền phát tiếng).
4. Thiết lập nguồn thu hình trong phần mềm Live:
   - **TikTok LIVE Studio**: Thêm nguồn (*Add source*) → *Window capture* → chọn cửa sổ overlay.
   - **OBS Studio**: Thêm *Browser Source* trỏ tới `http://localhost:3000/live/overlay.html`, kích thước `1080` x `1920`.
5. Bật LIVE trên TikTok, sau đó nhập `@username` của kênh vào bảng điều khiển và bấm **Kết nối**.

---

## Tương Tác Của Người Xem Trong Buổi Live

- **Bình luận bất kỳ**: Tự động bước vào chánh điện và an tọa (hệ thống tự mở rộng 24 → 36 → 64 → 100 chỗ). Khi đầy chỗ, người im lặng lâu nhất chưa dâng lễ sẽ nhường chỗ cho người mới.
- **Đổi y phục**: Bình luận một trong các từ khóa `nam`, `nữ`, `sư`, `ni`, `tiểu`, `bà`, `cao tăng`.
- **Dâng lễ / Tặng quà**: Banner xướng tên xuất hiện trang trọng, giọng đọc tiếng Việt đọc lời hồi hướng và lời nguyện gần nhất của Phật tử, thỉnh chuông và cộng điểm vào Bảng Công Đức.
- **Thả tim**: Trái tim bay lơ lửng trên đầu nhân vật.
- **Chia sẻ & Follow**: Ghi nhận vào nhật ký sự kiện của phòng live.

---

## An Toàn & Bảo Mật

- **Không cần tài khoản hay mật khẩu TikTok**: Server chỉ đọc luồng sự kiện công khai qua username.
- **Chạy cục bộ**: Mặc định chỉ lắng nghe trên `127.0.0.1` (localhost).
- **Chống can thiệp lạ**: WebSocket xác thực Origin và Host, Overlay ở chế độ chỉ đọc.
- **Lọc dữ liệu vào**: Cắt ngắn chuỗi, lọc ký tự an toàn trước khi vẽ canvas và escape XML trước khi gửi tới dịch vụ Microsoft Edge TTS.

---

## Giấy Phép & Miễn Trừ Trách Nhiệm

Dự án được cung cấp theo giấy phép **MIT**. Mã nguồn chia sẻ nhằm mục đích tham khảo kỹ thuật, lập trình và tu tập thiện tâm. Người sử dụng tự chịu trách nhiệm về nội dung phát sóng và tuân thủ quy định của các nền tảng mạng xã hội.
