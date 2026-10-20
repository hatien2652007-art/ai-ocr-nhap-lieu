// Kiểm tra dữ liệu hóa đơn sau OCR bằng logic xác định (không phụ thuộc AI):
// field bắt buộc + đối chiếu số học. Confidence do Gemini tự chấm chỉ là tham khảo,
// còn lệch số học là tín hiệu khách quan rằng đã đọc sai ít nhất một con số.

// Sai số cho phép khi so sánh tiền: tối thiểu 1 đồng, hoặc 0,05% số tiền
// (đơn giá có phần lẻ như xăng dầu, điện thường làm tròn khác nhau)
const MIN_TOLERANCE = 1;
const RELATIVE_TOLERANCE = 0.0005;

// Khi có lỗi số học, confidence tổng không được vượt mức này → luôn vào hàng kiểm tra lại
const MAX_CONFIDENCE_ON_MISMATCH = 0.6;

function nearlyEqual(a, b) {
  const x = a ?? 0;
  const y = b ?? 0;
  const tolerance = Math.max(MIN_TOLERANCE, RELATIVE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y)));
  return Math.abs(x - y) <= tolerance;
}

/** Trả về danh sách lỗi thiếu field bắt buộc (rỗng nếu đủ). */
export function findMissingFields(invoice) {
  const missing = [];
  if (!invoice?.so_chung_tu) missing.push("Số chứng từ");
  if (!invoice?.ngay_chung_tu) missing.push("Ngày chứng từ");
  if (!invoice?.khach_hang?.ten) missing.push("Tên khách hàng");
  if (!invoice?.khach_hang?.mst) missing.push("Mã số thuế khách hàng");
  if (!Array.isArray(invoice?.hang_hoa) || invoice.hang_hoa.length === 0) {
    missing.push("Danh sách hàng hóa");
  }
  if (!invoice?.tong_hop) missing.push("Tổng hợp tiền");
  return missing;
}

/** Đối chiếu số học, trả về danh sách cảnh báo dạng câu đọc được. */
export function findArithmeticMismatches(invoice) {
  const warnings = [];
  const items = Array.isArray(invoice?.hang_hoa) ? invoice.hang_hoa : [];

  items.forEach((item, i) => {
    const expected = (item.so_luong ?? 0) * (item.don_gia ?? 0);
    if (item.thanh_tien != null && !nearlyEqual(expected, item.thanh_tien)) {
      warnings.push(`Dòng ${i + 1}: số lượng × đơn giá không khớp thành tiền`);
    }
  });

  const tongHop = invoice?.tong_hop;
  if (tongHop && items.length > 0) {
    const sumLines = items.reduce(
      (sum, item) => sum + (item.thanh_tien ?? (item.so_luong ?? 0) * (item.don_gia ?? 0)),
      0
    );
    if (!nearlyEqual(sumLines, tongHop.tong_tien_hang)) {
      warnings.push("Tổng các dòng hàng không khớp tổng tiền hàng");
    }

    const expectedTotal =
      (tongHop.tong_tien_hang ?? 0) +
      (tongHop.tong_tien_thue_gtgt ?? 0) -
      (tongHop.tien_chiet_khau ?? 0);
    if (!nearlyEqual(expectedTotal, tongHop.tong_tien_thanh_toan)) {
      warnings.push("Tiền hàng + thuế − chiết khấu không khớp tổng thanh toán");
    }
  }

  return warnings;
}

/**
 * Kết hợp confidence của Gemini với kết quả kiểm tra xác định.
 * Trả về { overallConfidence, warnings, missing }.
 */
export function assessInvoice(invoice) {
  const missing = findMissingFields(invoice);
  const warnings = findArithmeticMismatches(invoice);

  let overallConfidence = Number(invoice?.ocr_meta?.overall_confidence);
  if (!Number.isFinite(overallConfidence)) overallConfidence = 0;
  overallConfidence = Math.min(1, Math.max(0, overallConfidence));

  if (warnings.length > 0 || missing.length > 0) {
    overallConfidence = Math.min(overallConfidence, MAX_CONFIDENCE_ON_MISMATCH);
  }

  return { overallConfidence, warnings, missing };
}
