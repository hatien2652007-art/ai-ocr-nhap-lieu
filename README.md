# OCR Nhập Liệu

Đọc hóa đơn bán hàng (PDF/ảnh) bằng Gemini, cho kế toán kiểm tra lại, rồi xuất Excel theo mẫu import chứng từ bán hàng của MISA SME.

- `frontend/` — giao diện React + Vite + Tailwind
- `backend/` — API Express, gọi Gemini, lưu Supabase
- `schema/` — JSON Schema hóa đơn, file mẫu Excel MISA, dữ liệu ví dụ
- `scripts/` — công cụ dòng lệnh tạo mẫu Excel, chuyển JSON sang Excel

## Cài đặt lần đầu

1. Supabase: mở **SQL Editor > New query**, dán nội dung `backend/supabase.sql`, bấm **Run**.
2. Mở `backend/.env`, điền:
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase **Settings > API Keys**, mục **Secret key**
   - `GEMINI_API_KEY`: lấy tại https://aistudio.google.com/apikey
3. Cài thư viện:
   ```
   cd backend && npm install
   cd ../frontend && npm install
   ```

## Chạy

Mở 2 terminal:

```
cd backend && npm run dev
cd frontend && npm run dev
```

Vào http://localhost:5173.

## Kiểm thử

```
cd backend && npm test
```

## Lưu ý

- Chưa có đăng nhập. Backend chỉ nghe trên `127.0.0.1`, không mở ra mạng ngoài. Cần thêm đăng nhập trước khi deploy lên server.
- Hàng đợi OCR nằm trong bộ nhớ. Tắt backend khi đang xử lý thì lần chạy sau tự xử lý tiếp các hóa đơn còn dở.
- Model mặc định `gemini-3.5-flash-lite`. Đổi bằng biến `GEMINI_MODEL` trong `.env`, số hóa đơn xử lý song song bằng `OCR_CONCURRENCY` (mặc định 5).
