import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { extractInvoice } from "./geminiOcr.js";
import { assessInvoice } from "./invoiceChecks.js";
import { createQueue } from "./queue.js";

// Trạng thái hóa đơn:
// processing   → đang chờ/đang gọi Gemini
// needs_review → confidence thấp hoặc lệch số học, cần người kiểm tra
// ready        → confidence cao, tự động sẵn sàng xuất Excel
// reviewed     → người dùng đã kiểm tra và xác nhận
// exported     → đã xuất Excel ít nhất một lần
// error        → Gemini không đọc được, có thể thử lại
export const STATUS = {
  PROCESSING: "processing",
  NEEDS_REVIEW: "needs_review",
  READY: "ready",
  REVIEWED: "reviewed",
  EXPORTED: "exported",
  ERROR: "error",
};

async function runOcr({ id, storagePath, mimeType }) {
  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from(config.storageBucket)
      .download(storagePath);
    if (downloadError) throw new Error(`Không tải được file gốc: ${downloadError.message}`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await extractInvoice(buffer, mimeType);
    const { overallConfidence, warnings, missing } = assessInvoice(data);
    const needsReview = overallConfidence < config.reviewThreshold;

    await updateInvoice(id, {
      status: needsReview ? STATUS.NEEDS_REVIEW : STATUS.READY,
      data,
      overall_confidence: overallConfidence,
      warnings: [...missing.map((m) => `Thiếu ${m.toLowerCase()}`), ...warnings],
      error_message: null,
    });
  } catch (err) {
    console.error(`OCR thất bại cho hóa đơn ${id}:`, err.message);
    await updateInvoice(id, { status: STATUS.ERROR, error_message: err.message });
  }
}

// Hóa đơn ở trạng thái processing quá lâu coi như bị kẹt (server tắt giữa chừng,
// mất kết nối khi ghi kết quả...) và được phép bấm "Thử lại".
export const STUCK_AFTER_MS = 10 * 60 * 1000;

const UPDATE_ATTEMPTS = 3;

/**
 * Ghi kết quả OCR. Chỉ ghi khi hóa đơn vẫn đang processing, để không đè lên
 * dữ liệu người dùng đã sửa trong lúc chờ. Thử lại khi lỗi mạng, vì nếu ghi
 * thất bại thì hóa đơn sẽ kẹt ở processing.
 */
async function updateInvoice(id, fields) {
  for (let attempt = 1; attempt <= UPDATE_ATTEMPTS; attempt++) {
    const { error } = await supabase
      .from("invoices")
      .update(fields)
      .eq("id", id)
      .eq("status", STATUS.PROCESSING);
    if (!error) return;
    console.error(`Không cập nhật được hóa đơn ${id} (lần ${attempt}):`, error.message);
    if (attempt < UPDATE_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2000));
  }
}

const ocrQueue = createQueue(config.ocrConcurrency, runOcr);

export function enqueueOcr(job) {
  ocrQueue.push(job);
}

export function queueSize() {
  return ocrQueue.size;
}

/**
 * Hàng đợi nằm trong bộ nhớ nên mất khi server tắt. Lúc khởi động, đưa các
 * hóa đơn còn kẹt ở trạng thái "processing" vào hàng đợi lại.
 */
export async function resumeStuckInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, storage_path, mime_type")
    .eq("status", STATUS.PROCESSING);
  if (error) {
    console.error("Không đọc được hóa đơn đang xử lý dở:", error.message);
    return;
  }
  for (const row of data) {
    // Đánh dấu lại thời điểm bắt đầu để không bị coi là kẹt ngay
    await supabase.from("invoices").update({ status: STATUS.PROCESSING }).eq("id", row.id);
    enqueueOcr({ id: row.id, storagePath: row.storage_path, mimeType: row.mime_type });
  }
  if (data.length > 0) console.log(`Tiếp tục xử lý ${data.length} hóa đơn còn dở.`);
}
