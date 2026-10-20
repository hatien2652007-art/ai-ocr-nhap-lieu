// Chuyển một hoặc nhiều hóa đơn (JSON đúng schema/hoa-don-ban-hang.schema.json)
// thành file Excel theo đúng cấu trúc cột của mẫu import MISA.
//
// Cách chạy: node scripts/json-to-excel.mjs <input.json> [output.xlsx]
//   input.json: một hóa đơn (object) hoặc nhiều hóa đơn (array)

import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  { key: "tk_no", header: "TK Nợ", width: 10 },
  { key: "tk_doanh_thu", header: "TK doanh thu", width: 12 },
  { key: "tk_thue", header: "TK thuế", width: 10 },
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

const LOAI_CHUNG_TU_LABEL = {
  ban_hang_trong_nuoc: "Bán hàng hóa, dịch vụ trong nước",
  ban_hang_xuat_khau: "Bán hàng hóa, dịch vụ xuất khẩu",
};

const HINH_THUC_TT_LABEL = {
  chua_thu_tien: "Chưa thu tiền",
  thu_tien_ngay: "Thu tiền ngay",
};

/** Validate tối thiểu: báo rõ hóa đơn nào thiếu field bắt buộc, không âm thầm bỏ qua. */
function validateInvoice(invoice, index) {
  const errors = [];
  const required = ["so_chung_tu", "ngay_chung_tu", "khach_hang", "hang_hoa", "tong_hop"];
  for (const field of required) {
    if (invoice[field] === undefined || invoice[field] === null) {
      errors.push(`thiếu "${field}"`);
    }
  }
  if (invoice.khach_hang && (!invoice.khach_hang.ten || !invoice.khach_hang.mst)) {
    errors.push('khach_hang thiếu "ten" hoặc "mst"');
  }
  if (!Array.isArray(invoice.hang_hoa) || invoice.hang_hoa.length === 0) {
    errors.push('"hang_hoa" phải là mảng có ít nhất 1 dòng');
  }
  if (errors.length > 0) {
    throw new Error(`Hóa đơn #${index} (${invoice.so_chung_tu ?? "?"}) không hợp lệ: ${errors.join(", ")}`);
  }
}

function invoiceToRows(invoice) {
  const { khach_hang, hang_hoa, tong_hop } = invoice;
  return hang_hoa.map((item) => ({
    loai_chung_tu: LOAI_CHUNG_TU_LABEL[invoice.loai_chung_tu] ?? invoice.loai_chung_tu ?? "",
    hinh_thuc_thanh_toan: HINH_THUC_TT_LABEL[invoice.hinh_thuc_thanh_toan] ?? invoice.hinh_thuc_thanh_toan ?? "",
    so_chung_tu: invoice.so_chung_tu ?? "",
    ngay_hach_toan: invoice.ngay_hach_toan ?? "",
    ngay_chung_tu: invoice.ngay_chung_tu ?? "",
    han_thanh_toan: invoice.han_thanh_toan ?? "",
    ma_khach_hang: khach_hang.ma_khach_hang ?? khach_hang.mst ?? "",
    ten_khach_hang: khach_hang.ten ?? "",
    mst_khach_hang: khach_hang.mst ?? "",
    dia_chi_khach_hang: khach_hang.dia_chi ?? "",
    nguoi_giao_dich: khach_hang.nguoi_giao_dich ?? "",
    dien_giai: invoice.dien_giai ?? "",
    tham_chieu: invoice.tham_chieu ?? "",
    ma_hang: item.ma_hang ?? "",
    ten_hang: item.ten_hang ?? "",
    tk_no: "",
    tk_doanh_thu: "",
    tk_thue: "",
    ma_quy_cach: item.ma_quy_cach ?? "",
    dvt: item.dvt ?? "",
    so_luong: item.so_luong ?? 0,
    don_gia: item.don_gia ?? 0,
    thanh_tien: item.thanh_tien ?? (item.so_luong ?? 0) * (item.don_gia ?? 0),
    thue_suat: item.thue_suat ?? 0,
    tien_thue_gtgt: item.tien_thue_gtgt ?? 0,
    tong_tien_hang: tong_hop.tong_tien_hang ?? 0,
    tien_chiet_khau: tong_hop.tien_chiet_khau ?? 0,
    tong_tien_thue_gtgt: tong_hop.tong_tien_thue_gtgt ?? 0,
    tong_tien_thanh_toan: tong_hop.tong_tien_thanh_toan ?? 0,
  }));
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg) {
    console.error("Cách dùng: node scripts/json-to-excel.mjs <input.json> [output.xlsx]");
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  const outputPath = outputArg
    ? path.resolve(outputArg)
    : path.join(__dirname, "..", "schema", "xuat-ban-hang.xlsx");

  const raw = JSON.parse(await readFile(inputPath, "utf-8"));
  const invoices = Array.isArray(raw) ? raw : [raw];

  invoices.forEach((inv, i) => validateInvoice(inv, i + 1));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Chứng từ bán hàng");
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E8F5" } };

  for (const invoice of invoices) {
    for (const row of invoiceToRows(invoice)) {
      sheet.addRow(row);
    }
  }

  for (const key of NUMBER_COLUMNS) {
    sheet.getColumn(key).numFmt = key === "thue_suat" ? '0"%"' : "#,##0";
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Đã xuất ${invoices.length} hóa đơn (${sheet.rowCount - 1} dòng) → ${outputPath}`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
