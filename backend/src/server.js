import express from "express";
import cors from "cors";
import multer from "multer";
import { config } from "./config.js";
import { invoicesRouter, HttpError, MAX_FILE_SIZE_MB } from "./routes/invoices.js";

import { resumeStuckInvoices } from "./services/processInvoice.js";

const app = express();

// Chỉ cho phép đúng các domain frontend đã khai báo gọi sang (ví dụ domain Vercel).
// Chưa có đăng nhập, nên mở CORS cho "*" nghĩa là mọi trang web trên internet đều
// gọi được API này — không làm vậy.
if (config.allowedOrigins.length > 0) {
  app.use(cors({ origin: config.allowedOrigins }));
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/invoices", invoicesRouter);

app.use((_req, res) => res.status(404).json({ error: "Không tìm thấy đường dẫn API" }));

// Express 5 tự chuyển lỗi từ handler async vào đây
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Lỗi đọc body từ express.json (JSON hỏng, quá lớn) có sẵn status 4xx
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Dữ liệu gửi lên không đúng định dạng JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Dữ liệu gửi lên quá lớn" });
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Có file vượt quá ${MAX_FILE_SIZE_MB}MB, hãy nén hoặc tách nhỏ rồi tải lại`
        : `Lỗi tải file: ${err.message}`;
    return res.status(400).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: "Lỗi máy chủ, vui lòng thử lại" });
});

// Nghe trên tất cả interface để tunnel (Cloudflare/ngrok) hoặc VPS reverse proxy
// chuyển tiếp được vào. Chưa có đăng nhập, nên CORS ở trên là lớp chặn chính —
// không public thẳng cổng này ra internet khi chưa có domain + HTTPS + auth.
app.listen(config.port, () => {
  console.log(`Backend chạy tại http://localhost:${config.port}`);
  resumeStuckInvoices();
});
