import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import os from "node:os";
import multer from "multer";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";
import { SUPPORTED_MIME_TYPES } from "../services/geminiOcr.js";
import { assessInvoice } from "../services/invoiceChecks.js";
import { buildWorkbook } from "../services/misaExcel.js";
import { STATUS, STUCK_AFTER_MS, enqueueOcr, queueSize } from "../services/processInvoice.js";

export const MAX_FILE_SIZE_MB = 20;
const MAX_FILES_PER_UPLOAD = 50;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const LIST_LIMIT = 1000;
const MAX_EXPORT = 2000;
// Số id mỗi lần gửi cho Supabase, tránh URL quá dài khi xuất nhiều hóa đơn
const ID_BATCH_SIZE = 100;
const EXPORTABLE_STATUSES = [STATUS.READY, STATUS.REVIEWED, STATUS.EXPORTED];
const ALL_STATUSES = new Set(Object.values(STATUS));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Ghi file tải lên ra thư mục tạm thay vì giữ trong RAM (50 file × 20MB mỗi lần)
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: MAX_FILES_PER_UPLOAD },
  // Tên file tiếng Việt có dấu được gửi dạng UTF-8
  defParamCharset: "utf8",
});

export const invoicesRouter = Router();

/** Lỗi có message hiển thị được cho người dùng, kèm HTTP status. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assertUuid(id) {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new HttpError(400, "Mã hóa đơn không hợp lệ");
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function getInvoiceOr404(id) {
  assertUuid(id);
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Không tìm thấy hóa đơn");
  return data;
}

function warningsFor(data) {
  const { warnings, missing } = assessInvoice(data);
  return [...missing.map((m) => `Thiếu ${m.toLowerCase()}`), ...warnings];
}

async function storeUploadedFile(file) {
  if (!SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return { rejected: "Chỉ nhận PDF, JPG, PNG, WEBP" };
  }

  const id = randomUUID();
  // Đường dẫn chỉ dùng ký tự ASCII do server sinh, tên gốc có dấu lưu riêng ở cột file_name
  const storagePath = `${id}.${EXTENSION_BY_MIME[file.mimetype]}`;

  const { error: uploadError } = await supabase.storage
    .from(config.storageBucket)
    .upload(storagePath, await readFile(file.path), { contentType: file.mimetype });
  if (uploadError) return { rejected: `Lưu file thất bại: ${uploadError.message}` };

  const { data: row, error: insertError } = await supabase
    .from("invoices")
    .insert({
      id,
      file_name: file.originalname,
      mime_type: file.mimetype,
      storage_path: storagePath,
      status: STATUS.PROCESSING,
    })
    .select("id, created_at, updated_at, status, file_name, data, overall_confidence, warnings, error_message")
    .single();
  if (insertError) {
    await supabase.storage.from(config.storageBucket).remove([storagePath]);
    return { rejected: `Lưu dữ liệu thất bại: ${insertError.message}` };
  }

  enqueueOcr({ id, storagePath, mimeType: file.mimetype });
  return { row };
}

// Tải lên một hoặc nhiều file, lưu vào Storage rồi đưa vào hàng đợi OCR.
invoicesRouter.post("/", upload.array("files"), async (req, res) => {
  const files = req.files ?? [];
  if (files.length === 0) throw new HttpError(400, "Chưa chọn file nào");

  const created = [];
  const rejected = [];
  try {
    for (const file of files) {
      const result = await storeUploadedFile(file);
      if (result.row) created.push(result.row);
      else rejected.push({ file_name: file.originalname, reason: result.rejected });
    }
  } finally {
    await Promise.all(files.map((f) => unlink(f.path).catch(() => {})));
  }

  res.status(created.length > 0 ? 201 : 400).json({ created, rejected, queue_size: queueSize() });
});

// Danh sách hóa đơn, lọc theo trạng thái: ?status=needs_review hoặc ?status=ready,reviewed
// Trả kèm "total" để giao diện báo khi danh sách bị cắt bớt.
invoicesRouter.get("/", async (req, res) => {
  let query = supabase
    .from("invoices")
    .select("id, created_at, updated_at, status, file_name, data, overall_confidence, warnings, error_message", {
      count: "exact",
    })
    .order("created_at", { ascending: req.query.order === "oldest" })
    .limit(LIST_LIMIT);

  if (req.query.status) {
    const statuses = String(req.query.status).split(",");
    if (statuses.some((s) => !ALL_STATUSES.has(s))) throw new HttpError(400, "Trạng thái không hợp lệ");
    query = query.in("status", statuses);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  res.json({ invoices: data, total: count ?? data.length, queue_size: queueSize() });
});

// Chi tiết một hóa đơn, kèm link tạm thời để xem ảnh/PDF gốc
invoicesRouter.get("/:id", async (req, res) => {
  const invoice = await getInvoiceOr404(req.params.id);
  let file_url = null;
  if (invoice.storage_path) {
    const { data } = await supabase.storage
      .from(config.storageBucket)
      .createSignedUrl(invoice.storage_path, SIGNED_URL_TTL_SECONDS);
    file_url = data?.signedUrl ?? null;
  }
  res.json({ ...invoice, file_url });
});

// Người dùng sửa dữ liệu và xác nhận đã kiểm tra
invoicesRouter.patch("/:id", async (req, res) => {
  assertUuid(req.params.id);
  const { data, expected_updated_at: expectedUpdatedAt } = req.body ?? {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpError(400, "Thiếu dữ liệu hóa đơn");
  }
  if (!expectedUpdatedAt) throw new HttpError(400, "Thiếu thời điểm cập nhật của hóa đơn");

  // Chỉ ghi khi hóa đơn chưa bị thay đổi kể từ lúc người dùng mở ra (OCR chạy lại,
  // người khác sửa, vừa được xuất...) và không còn đang xử lý.
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ data, status: STATUS.REVIEWED, warnings: warningsFor(data) })
    .eq("id", req.params.id)
    .eq("updated_at", expectedUpdatedAt)
    .neq("status", STATUS.PROCESSING)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    await getInvoiceOr404(req.params.id);
    throw new HttpError(409, "Hóa đơn vừa được thay đổi ở nơi khác. Tải lại trang để xem bản mới nhất rồi sửa lại.");
  }
  res.json(updated);
});

// Đọc lại hóa đơn bị lỗi, hoặc bị kẹt ở trạng thái đang xử lý quá lâu
invoicesRouter.post("/:id/retry", async (req, res) => {
  const invoice = await getInvoiceOr404(req.params.id);
  const stuck =
    invoice.status === STATUS.PROCESSING && Date.now() - new Date(invoice.updated_at).getTime() > STUCK_AFTER_MS;
  if (invoice.status !== STATUS.ERROR && !stuck) {
    throw new HttpError(409, "Chỉ đọc lại được hóa đơn bị lỗi");
  }

  // Cập nhật có điều kiện: hai lần bấm gần nhau chỉ có một lần được đưa vào hàng đợi
  const { data: claimed, error } = await supabase
    .from("invoices")
    .update({ status: STATUS.PROCESSING, error_message: null })
    .eq("id", invoice.id)
    .eq("updated_at", invoice.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) throw new HttpError(409, "Hóa đơn đang được đọc lại");

  enqueueOcr({ id: invoice.id, storagePath: invoice.storage_path, mimeType: invoice.mime_type });
  res.status(202).json({ id: invoice.id, status: STATUS.PROCESSING });
});

// Xuất Excel theo mẫu MISA cho các hóa đơn được chọn
invoicesRouter.post("/export", async (req, res) => {
  const ids = [...new Set(req.body?.ids ?? [])];
  if (ids.length === 0) throw new HttpError(400, "Chưa chọn hóa đơn nào để xuất");
  if (ids.length > MAX_EXPORT) throw new HttpError(400, `Mỗi lần xuất tối đa ${MAX_EXPORT} hóa đơn`);
  ids.forEach(assertUuid);

  const rows = [];
  for (const batch of chunk(ids, ID_BATCH_SIZE)) {
    const { data, error } = await supabase.from("invoices").select("id, status, data, created_at").in("id", batch);
    if (error) throw new Error(error.message);
    rows.push(...data);
  }

  if (rows.length !== ids.length || rows.some((r) => !EXPORTABLE_STATUSES.includes(r.status))) {
    throw new HttpError(409, "Có hóa đơn chưa sẵn sàng xuất (đang xử lý, lỗi hoặc cần kiểm tra lại). Tải lại trang rồi chọn lại.");
  }
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));

  const buffer = await buildWorkbook(rows.map((r) => r.data)).xlsx.writeBuffer();

  // Đánh dấu đã xuất TRƯỚC khi gửi file. Nếu đánh dấu thất bại thì báo lỗi luôn,
  // tránh trường hợp đã tải file về nhưng hóa đơn vẫn hiện chưa xuất rồi bị nhập MISA lần hai.
  for (const batch of chunk(ids, ID_BATCH_SIZE)) {
    const { error } = await supabase
      .from("invoices")
      .update({ status: STATUS.EXPORTED })
      .in("id", batch)
      .in("status", EXPORTABLE_STATUSES);
    if (error) throw new Error(`Không đánh dấu được trạng thái đã xuất: ${error.message}`);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="MISA-ban-hang-${stamp}.xlsx"`);
  res.send(Buffer.from(buffer));
});
