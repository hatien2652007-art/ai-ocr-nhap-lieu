import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMissingFields,
  findArithmeticMismatches,
  assessInvoice,
} from "../src/services/invoiceChecks.js";

// Hóa đơn hợp lệ, khớp với schema/vi-du-hoa-don.json
function validInvoice() {
  return {
    so_chung_tu: "16",
    ngay_chung_tu: "2024-08-07",
    khach_hang: { ten: "CÔNG TY TNHH THỊNH TIẾN", mst: "0313944405" },
    hang_hoa: [{ ten_hang: "Thuốc xe máy đào", so_luong: 1, don_gia: 15400000, thanh_tien: 15400000, thue_suat: 8 }],
    tong_hop: {
      tong_tien_hang: 15400000,
      tong_tien_thue_gtgt: 1232000,
      tien_chiet_khau: 0,
      tong_tien_thanh_toan: 16632000,
    },
    ocr_meta: { overall_confidence: 0.95 },
  };
}

test("hóa đơn hợp lệ không có lỗi và giữ nguyên confidence", () => {
  const result = assessInvoice(validInvoice());
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.overallConfidence, 0.95);
});

test("báo thiếu MST khách hàng", () => {
  const inv = validInvoice();
  inv.khach_hang.mst = "";
  assert.deepEqual(findMissingFields(inv), ["Mã số thuế khách hàng"]);
});

test("báo thiếu danh sách hàng hóa khi mảng rỗng", () => {
  const inv = validInvoice();
  inv.hang_hoa = [];
  assert.ok(findMissingFields(inv).includes("Danh sách hàng hóa"));
});

test("phát hiện số lượng × đơn giá lệch thành tiền", () => {
  const inv = validInvoice();
  inv.hang_hoa[0].thanh_tien = 14400000; // đọc nhầm 5 thành 4
  const warnings = findArithmeticMismatches(inv);
  assert.ok(warnings.some((w) => w.startsWith("Dòng 1")));
});

test("phát hiện tổng thanh toán không khớp tiền hàng + thuế", () => {
  const inv = validInvoice();
  inv.tong_hop.tong_tien_thanh_toan = 16682000;
  const warnings = findArithmeticMismatches(inv);
  assert.ok(warnings.some((w) => w.includes("tổng thanh toán")));
});

test("cho phép lệch 1 đồng do làm tròn", () => {
  const inv = validInvoice();
  inv.tong_hop.tong_tien_thanh_toan = 16632001;
  assert.deepEqual(findArithmeticMismatches(inv), []);
});

test("đơn giá có phần lẻ làm tròn trên hóa đơn không bị báo lệch", () => {
  const inv = validInvoice();
  // 152,37 lít × 23.456,7 = 3.574.107,4 — hóa đơn ghi 3.574.110
  inv.hang_hoa = [{ ten_hang: "Xăng RON95", so_luong: 152.37, don_gia: 23456.7, thanh_tien: 3574110, thue_suat: 10 }];
  inv.tong_hop = { tong_tien_hang: 3574110, tong_tien_thue_gtgt: 357411, tien_chiet_khau: 0, tong_tien_thanh_toan: 3931521 };
  assert.deepEqual(findArithmeticMismatches(inv), []);
});

test("vẫn bắt lỗi đọc nhầm một chữ số dù số tiền lớn", () => {
  const inv = validInvoice();
  inv.hang_hoa[0].thanh_tien = 15900000; // đọc nhầm 4 thành 9
  assert.ok(findArithmeticMismatches(inv).length > 0);
});

test("lệch số học kéo confidence xuống dưới ngưỡng kiểm tra lại", () => {
  const inv = validInvoice();
  inv.hang_hoa[0].thanh_tien = 14400000;
  const result = assessInvoice(inv);
  assert.ok(result.overallConfidence < 0.7);
});

test("confidence không hợp lệ từ model được coi là 0", () => {
  const inv = validInvoice();
  inv.ocr_meta.overall_confidence = "cao";
  assert.equal(assessInvoice(inv).overallConfidence, 0);
});

test("confidence vượt 1 bị giới hạn về 1", () => {
  const inv = validInvoice();
  inv.ocr_meta.overall_confidence = 1.4;
  assert.equal(assessInvoice(inv).overallConfidence, 1);
});
