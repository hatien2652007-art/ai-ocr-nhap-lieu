import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { invoiceToRows, buildWorkbook, COLUMNS } from "../src/services/misaExcel.js";

const example = JSON.parse(
  await readFile(new URL("../../schema/vi-du-hoa-don.json", import.meta.url), "utf-8")
)[0];

test("mỗi dòng hàng hóa thành một dòng Excel", () => {
  const inv = structuredClone(example);
  inv.hang_hoa.push({ ten_hang: "Dầu nhớt", so_luong: 2, don_gia: 100000, thue_suat: 8 });
  const rows = invoiceToRows(inv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].so_chung_tu, "16");
  assert.equal(rows[1].thanh_tien, 200000); // tự tính khi thiếu thành tiền
});

test("map nhãn tiếng Việt và để trống cột tài khoản", () => {
  const [row] = invoiceToRows(example);
  assert.equal(row.loai_chung_tu, "Bán hàng hóa, dịch vụ trong nước");
  assert.equal(row.hinh_thuc_thanh_toan, "Chưa thu tiền");
  assert.equal(row.tk_no, "");
  assert.equal(row.tk_doanh_thu, "");
});

test("ngày hạch toán lấy theo ngày chứng từ khi để trống", () => {
  const inv = structuredClone(example);
  inv.ngay_hach_toan = "";
  assert.equal(invoiceToRows(inv)[0].ngay_hach_toan, "2024-08-07");
});

test("file Excel ghi ra đọc lại được, đúng header và số tiền", async () => {
  const buffer = await buildWorkbook([example]).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet("Chứng từ bán hàng");
  assert.equal(sheet.getRow(1).getCell(1).value, COLUMNS[0].header);
  const totalCol = COLUMNS.findIndex((c) => c.key === "tong_tien_thanh_toan") + 1;
  assert.equal(sheet.getRow(2).getCell(totalCol).value, 16632000);
});
