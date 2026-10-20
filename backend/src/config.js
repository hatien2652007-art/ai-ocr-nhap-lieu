import "dotenv/config";

// Đọc và kiểm tra biến môi trường một lần khi khởi động, báo rõ thiếu biến nào
// thay vì để lỗi mơ hồ xuất hiện lúc gọi API.
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Thiếu biến môi trường trong backend/.env: ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // Đo thử 2026-10-20 trên hóa đơn mẫu: 3.5-flash-lite đọc đúng hết, 3-4 giây/hóa đơn.
  // 3.5-flash chậm (~30s) và hay báo quá tải 503; 3.1-flash-lite rẻ hơn nhưng 10-37s;
  // 2.5-flash và 2.5-flash-lite không còn mở cho tài khoản mới.
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  // Số hóa đơn gọi Gemini cùng lúc, tránh dồn lỗi 429 khi upload hàng loạt
  ocrConcurrency: Number(process.env.OCR_CONCURRENCY) || 5,
  // Danh sách domain frontend được phép gọi API, phân cách bằng dấu phẩy
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  port: Number(process.env.PORT) || 3001,
  storageBucket: "invoice-files",
  // Dưới ngưỡng này hóa đơn vào hàng "cần kiểm tra lại"
  reviewThreshold: 0.7,
};
