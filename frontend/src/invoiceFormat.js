// Hàm định dạng và nhãn dùng chung cho các màn hình hiển thị hóa đơn.

export const STATUS = {
  PROCESSING: "processing",
  NEEDS_REVIEW: "needs_review",
  READY: "ready",
  REVIEWED: "reviewed",
  EXPORTED: "exported",
  ERROR: "error",
};

export const STATUS_LABELS = {
  processing: { text: "Đang xử lý", className: "text-action" },
  needs_review: { text: "Cần kiểm tra", className: "text-warn" },
  ready: { text: "Sẵn sàng", className: "text-good" },
  reviewed: { text: "Đã kiểm tra", className: "text-good" },
  exported: { text: "Đã xuất", className: "text-ink/40" },
  error: { text: "Lỗi", className: "text-red-700" },
};

// Dưới 70% coi là cần người kiểm tra lại. Phải khớp config.reviewThreshold ở backend.
export const REVIEW_THRESHOLD = 0.7;

export function isLowConfidence(score) {
  return score != null && score < REVIEW_THRESHOLD;
}

// Số kiểu Việt Nam: dấu chấm phân cách hàng nghìn, dấu phẩy là thập phân.
// "1.500.000" = 1500000, "2,35" = 2.35
const VN_NUMBER_RE = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/** Đọc số người dùng gõ. Ô trống = 0. Không hợp lệ trả về null để báo lỗi. */
export function parseVnNumber(text) {
  const cleaned = String(text ?? "").replace(/[\sđ]/gi, "");
  if (cleaned === "") return 0;
  if (!VN_NUMBER_RE.test(cleaned)) return null;
  return Number(cleaned.replace(/\./g, "").replace(",", "."));
}

export function formatVnNumber(n) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 6 });
}

export function formatVnd(n) {
  return (Number(n) || 0).toLocaleString("vi-VN") + " đ";
}

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
