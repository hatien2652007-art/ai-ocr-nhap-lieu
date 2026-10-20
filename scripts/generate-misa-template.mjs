// Tạo file Excel MẪU (chỉ có header + 1 dòng ví dụ) để kế toán xem trước cấu trúc
// cột khớp với màn hình "Chứng từ bán hàng" của MISA SME.
//
// Cách chạy: node scripts/generate-misa-template.mjs
//
// Mỗi dòng hàng hóa trong hóa đơn = 1 dòng Excel. Các dòng cùng một hóa đơn
// lặp lại thông tin chứng từ/khách hàng (đúng kiểu MISA yêu cầu khi import
// nhiều dòng hàng cho một chứng từ).

import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "schema", "mau-import-ban-hang-MISA.xlsx");

// Cột theo đúng thứ tự xuất hiện trên màn hình MISA (ảnh người dùng gửi).
// key: dùng để tra cứu khi đổ dữ liệu từ JSON OCR (xem json-to-excel.mjs)
const COLUMNS = [
  { key: "loai_chung_tu", header: "Loại chứng từ", width: 24 },
  { key: "hinh_thuc_thanh_toan", header: "Hình thức thanh toán", width: 20 },
  { key: "so_chung_tu", header: "Số chứng từ", width: 14 },
  { key: "ngay_hach_toan", header: "Ngày hạch toán", width: 14 },
  { key: "ngay_chung_tu", header: "Ngày chứng từ", width: 14 },
  { key: "han_thanh_toan", header: "Hạn thanh toán", width: 14 },
  { key: "ma_khach_hang", header: "Mã khách hàng", width: 16 },
  { key: "ten_khach_hang", header: "Tên khách hàng", width: 36 },
  { key: "mst_khach_hang", header: "Mã số thuế", width: 16 },
  { key: "dia_chi_khach_hang", header: "Địa chỉ", width: 36 },
  { key: "nguoi_giao_dich", header: "Người giao dịch", width: 20 },
  { key: "dien_giai", header: "Diễn giải", width: 30 },
  { key: "tham_chieu", header: "Tham chiếu", width: 16 },
  { key: "ma_hang", header: "Mã hàng", width: 14 },
  { key: "ten_hang", header: "Tên hàng", width: 32 },
  { key: "tk_no", header: "TK Nợ", width: 10 },            // để trống — kế toán tự điền
  { key: "tk_doanh_thu", header: "TK doanh thu", width: 12 }, // để trống — kế toán tự điền
  { key: "tk_thue", header: "TK thuế", width: 10 },          // để trống — kế toán tự điền
  { key: "ma_quy_cach", header: "Mã quy cách", width: 14 },
  { key: "dvt", header: "ĐVT", width: 10 },
  { key: "so_luong", header: "Số lượng", width: 12 },
  { key: "don_gia", header: "Đơn giá", width: 14 },
  { key: "thanh_tien", header: "Thành tiền", width: 16 },
  { key: "thue_suat", header: "% Thuế GTGT", width: 12 },
  { key: "tien_thue_gtgt", header: "Tiền thuế GTGT", width: 16 },
  { key: "tong_tien_hang", header: "Tổng tiền hàng", width: 16 },
  { key: "tien_chiet_khau", header: "Tiền chiết khấu", width: 14 },
  { key: "tong_tien_thue_gtgt", header: "Tổng tiền thuế GTGT", width: 18 },
  { key: "tong_tien_thanh_toan", header: "Tổng tiền thanh toán", width: 18 },
];

// Các cột tiền/số lượng cần định dạng số, không phải text
const NUMBER_COLUMNS = new Set([
  "so_luong",
  "don_gia",
  "thanh_tien",
  "thue_suat",
  "tien_thue_gtgt",
  "tong_tien_hang",
  "tien_chiet_khau",
  "tong_tien_thue_gtgt",
  "tong_tien_thanh_toan",
]);

// Cột để trống chủ động — kế toán tự hạch toán theo sơ đồ tài khoản riêng của doanh nghiệp
const BLANK_COLUMNS = new Set(["tk_no", "tk_doanh_thu", "tk_thue"]);

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Chứng từ bán hàng");

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE1E8F5" },
  };
  headerRow.eachCell((cell) => {
    cell.border = { bottom: { style: "thin", color: { argb: "FF9AA7BD" } } };
  });

  // Dòng ví dụ: khớp với dữ liệu trên ảnh gửi, để kế toán đối chiếu cấu trúc đúng.
  const exampleRow = {
    loai_chung_tu: "Bán hàng hóa, dịch vụ trong nước",
    hinh_thuc_thanh_toan: "Chưa thu tiền",
    so_chung_tu: "16",
    ngay_hach_toan: "2024-08-07",
    ngay_chung_tu: "2024-08-07",
    han_thanh_toan: "",
    ma_khach_hang: "0313944405",
    ten_khach_hang: "CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ VÀ XÂY LẮP THỊNH TIẾN",
    mst_khach_hang: "0313944405",
    dia_chi_khach_hang: "Số 59, Đường 69, Khu phố 2, Phường Tân Quy, Quận 7, TP Hồ Chí Minh, Việt Nam",
    nguoi_giao_dich: "",
    dien_giai: "",
    tham_chieu: "",
    ma_hang: "BR",
    ten_hang: "Thuốc xe máy đào",
    tk_no: "",
    tk_doanh_thu: "",
    tk_thue: "",
    ma_quy_cach: "",
    dvt: "",
    so_luong: 1,
    don_gia: 15400000,
    thanh_tien: 15400000,
    thue_suat: 8,
    tien_thue_gtgt: 1232000,
    tong_tien_hang: 15400000,
    tien_chiet_khau: 0,
    tong_tien_thue_gtgt: 1232000,
    tong_tien_thanh_toan: 16632000,
  };
  sheet.addRow(exampleRow);

  sheet.getColumn("so_luong").numFmt = "#,##0";
  for (const key of NUMBER_COLUMNS) {
    if (key === "so_luong") continue;
    if (key === "thue_suat") {
      sheet.getColumn(key).numFmt = '0"%"';
    } else {
      sheet.getColumn(key).numFmt = "#,##0";
    }
  }

  sheet.getRow(1).eachCell((cell, colNumber) => {
    const colKey = COLUMNS[colNumber - 1].key;
    if (BLANK_COLUMNS.has(colKey)) {
      cell.note = "Để trống — kế toán tự điền theo sơ đồ tài khoản của doanh nghiệp";
    }
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Đã tạo file mẫu: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Lỗi khi tạo file mẫu:", err);
  process.exit(1);
});
