import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVnNumber, formatVnNumber } from "./invoiceFormat.js";

test("dấu chấm là phân cách hàng nghìn", () => {
  assert.equal(parseVnNumber("1.500"), 1500);
  assert.equal(parseVnNumber("1.500.000"), 1500000);
  assert.equal(parseVnNumber("15.400.000"), 15400000);
});

test("dấu phẩy là phần thập phân", () => {
  assert.equal(parseVnNumber("2,35"), 2.35);
  assert.equal(parseVnNumber("1.234,5"), 1234.5);
});

test("số không có phân cách", () => {
  assert.equal(parseVnNumber("1500"), 1500);
  assert.equal(parseVnNumber("0"), 0);
});

test("bỏ khoảng trắng, chữ đ và dấu âm", () => {
  assert.equal(parseVnNumber(" 15 400 000 đ "), 15400000);
  assert.equal(parseVnNumber("-50.000"), -50000);
});

test("ô trống là 0", () => {
  assert.equal(parseVnNumber(""), 0);
  assert.equal(parseVnNumber("   "), 0);
});

test("chữ không hợp lệ trả về null, không âm thầm thành 0", () => {
  assert.equal(parseVnNumber("abc"), null);
  assert.equal(parseVnNumber("1,2,3"), null);
  assert.equal(parseVnNumber("1.50"), null); // nhóm hàng nghìn phải đủ 3 chữ số
  assert.equal(parseVnNumber("12a"), null);
});

test("định dạng ra rồi đọc lại được đúng số ban đầu", () => {
  for (const n of [0, 1500, 15400000, 2.35, 1234.5]) {
    assert.equal(parseVnNumber(formatVnNumber(n)), n);
  }
});
