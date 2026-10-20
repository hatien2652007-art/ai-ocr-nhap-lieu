import { GoogleGenAI, Type, ApiError } from "@google/genai";
import { config } from "../config.js";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;

// Các field có confidence riêng. Tên phẳng (không dấu chấm) để Gemini và frontend
// dùng chung một bộ key.
export const CONFIDENCE_FIELDS = [
  "so_chung_tu",
  "ngay_chung_tu",
  "khach_hang_ten",
  "khach_hang_mst",
  "khach_hang_dia_chi",
  "hang_hoa",
  "tong_tien_hang",
  "tong_tien_thue_gtgt",
  "tong_tien_thanh_toan",
];

// responseSchema theo định dạng Gemini (OpenAPI subset), map đầy đủ
// schema/hoa-don-ban-hang.schema.json.
const invoiceResponseSchema = {
  type: Type.OBJECT,
  required: ["so_chung_tu", "ngay_chung_tu", "khach_hang", "hang_hoa", "tong_hop", "ocr_meta"],
  properties: {
    loai_chung_tu: { type: Type.STRING, format: "enum", enum: ["ban_hang_trong_nuoc", "ban_hang_xuat_khau"] },
    hinh_thuc_thanh_toan: { type: Type.STRING, format: "enum", enum: ["chua_thu_tien", "thu_tien_ngay"] },
    so_chung_tu: { type: Type.STRING },
    ngay_hach_toan: { type: Type.STRING },
    ngay_chung_tu: { type: Type.STRING },
    han_thanh_toan: { type: Type.STRING },
    dien_giai: { type: Type.STRING },
    tham_chieu: { type: Type.STRING },
    khach_hang: {
      type: Type.OBJECT,
      required: ["ten", "mst"],
      properties: {
        ma_khach_hang: { type: Type.STRING },
        ten: { type: Type.STRING },
        mst: { type: Type.STRING },
        dia_chi: { type: Type.STRING },
        nguoi_giao_dich: { type: Type.STRING },
      },
    },
    hang_hoa: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["ten_hang", "so_luong", "don_gia", "thue_suat"],
        properties: {
          ma_hang: { type: Type.STRING },
          ten_hang: { type: Type.STRING },
          ma_quy_cach: { type: Type.STRING },
          dvt: { type: Type.STRING },
          so_luong: { type: Type.NUMBER },
          don_gia: { type: Type.NUMBER },
          thanh_tien: { type: Type.NUMBER },
          thue_suat: { type: Type.NUMBER },
          tien_thue_gtgt: { type: Type.NUMBER },
        },
      },
    },
    tong_hop: {
      type: Type.OBJECT,
      required: ["tong_tien_hang", "tong_tien_thue_gtgt", "tong_tien_thanh_toan"],
      properties: {
        tong_tien_hang: { type: Type.NUMBER },
        tong_tien_thue_gtgt: { type: Type.NUMBER },
        tien_chiet_khau: { type: Type.NUMBER },
        tong_tien_thanh_toan: { type: Type.NUMBER },
      },
    },
    ocr_meta: {
      type: Type.OBJECT,
      required: ["overall_confidence", "field_confidence"],
      properties: {
        overall_confidence: { type: Type.NUMBER },
        field_confidence: {
          type: Type.OBJECT,
          required: CONFIDENCE_FIELDS,
          properties: Object.fromEntries(CONFIDENCE_FIELDS.map((key) => [key, { type: Type.NUMBER }])),
        },
      },
    },
  },
};

function buildPrompt() {
  return `Bạn là chuyên viên nhập liệu kế toán Việt Nam. Đọc hóa đơn bán hàng (hóa đơn GTGT) trong file và trích xuất đúng theo schema JSON.

Quy tắc định dạng:
- Ngày theo dạng YYYY-MM-DD. Nếu không có ngày hạch toán riêng, dùng ngày chứng từ.
- Mã số thuế chỉ gồm chữ số và dấu gạch ngang, bỏ khoảng trắng.
- Tiền là số nguyên VND, không có dấu chấm/phẩy phân cách. Thuế suất là số phần trăm (8, 10, 0).
- "khach_hang" là NGƯỜI MUA trên hóa đơn, không phải người bán.
- Không tìm thấy giá trị thì để chuỗi rỗng hoặc 0. Không bịa dữ liệu.

Quy tắc chấm "ocr_meta.field_confidence" (0.0 - 1.0), là độ chắc chắn của bạn khi đọc field đó:
- 0.95 - 1.0: rõ ràng, không mơ hồ.
- 0.7 - 0.94: đọc được nhưng có chỗ mờ, phải đoán 1 ký tự từ ngữ cảnh.
- 0.4 - 0.69: mờ, bị che, nghiêng, hoặc có thể nhầm giữa các cách đọc (8/3, 0/O, 1/7).
- 0.0 - 0.39: không thấy field trong file, phải suy đoán hoặc để trống.
"hang_hoa" là confidence chung cho toàn bộ bảng hàng hóa.
"overall_confidence" là mức tin cậy chung, ưu tiên số chứng từ, mã số thuế và tổng thanh toán.

Chỉ trả về JSON đúng schema.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
  // Timeout (AbortError), lỗi mạng, hoặc JSON hỏng → thử lại
  return true;
}

async function callGemini(fileBuffer, mimeType) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
            { text: buildPrompt() },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: invoiceResponseSchema,
        temperature: 0,
        abortSignal: controller.signal,
      },
    });
    if (!response.text) throw new Error("Gemini không trả về nội dung");
    return JSON.parse(response.text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Trích xuất hóa đơn bán hàng từ file. Ném lỗi (message tiếng Việt) nếu thất bại
 * sau khi đã thử lại — caller lưu message đó vào invoices.error_message.
 */
export async function extractInvoice(fileBuffer, mimeType) {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Định dạng file không hỗ trợ: ${mimeType}`);
  }
  if (!fileBuffer?.length) {
    throw new Error("File rỗng hoặc không đọc được");
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callGemini(fileBuffer, mimeType);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;
      await sleep(2 ** attempt * 1000); // 2s, 4s
    }
  }

  if (lastError instanceof ApiError) {
    throw new Error(`Gemini API lỗi ${lastError.status}: ${lastError.message}`);
  }
  if (lastError?.name === "AbortError") {
    throw new Error(`Gemini không phản hồi sau ${REQUEST_TIMEOUT_MS / 1000} giây`);
  }
  throw new Error(`Không đọc được hóa đơn: ${lastError?.message ?? "lỗi không xác định"}`);
}
