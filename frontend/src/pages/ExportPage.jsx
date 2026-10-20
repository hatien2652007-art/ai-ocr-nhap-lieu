import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { exportExcel } from "../api";
import { useInvoices } from "../useInvoices";
import { STATUS, formatVnd, formatDate } from "../invoiceFormat";
import ConfidenceBadge from "../components/ConfidenceBadge";
import StatusText from "../components/StatusText";

// Hóa đơn còn trong hàng "cần kiểm tra lại" hoặc bị lỗi không hiện ở đây.
// Hóa đơn đã xuất xem ở tab riêng, để không đẩy hóa đơn chưa xuất ra khỏi danh sách.
const PENDING_STATUSES = [STATUS.READY, STATUS.REVIEWED];
const EXPORTED_STATUSES = [STATUS.EXPORTED];

export default function ExportPage() {
  const [showExported, setShowExported] = useState(false);
  // Chưa xuất: cũ nhất trước để xuất theo thứ tự; đã xuất: mới nhất trước
  const { invoices, total, loading, error, reload } = useInvoices(
    showExported ? EXPORTED_STATUSES : PENDING_STATUSES,
    showExported ? "newest" : "oldest"
  );
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Bỏ các id không còn trong danh sách (ví dụ sau khi tải lại hoặc đổi tab)
  const selectedIds = invoices.filter((i) => selected.has(i.id)).map((i) => i.id);

  function switchTab(exported) {
    setShowExported(exported);
    setSelected(new Set());
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const selectedTotal = invoices
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + (i.data?.tong_hop?.tong_tien_thanh_toan ?? 0), 0);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportExcel(selectedIds);
      setSelected(new Set());
      reload();
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Xuất Excel</h1>
          <p className="mt-1 text-sm text-ink/60">
            Chọn chứng từ để xuất thành file Excel theo mẫu nhập chứng từ bán hàng của MISA.
          </p>
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5 text-sm" role="tablist">
          {[
            [false, "Chưa xuất"],
            [true, "Đã xuất"],
          ].map(([value, label]) => (
            <button
              key={label}
              role="tab"
              aria-selected={showExported === value}
              onClick={() => switchTab(value)}
              className={`rounded px-3 py-1.5 font-medium ${
                showExported === value ? "bg-ink text-white" : "text-ink/60 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {total > invoices.length && (
        <p className="mt-4 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink/70">
          Đang hiện <span className="tabular font-medium text-ink">{invoices.length}</span> /{" "}
          <span className="tabular font-medium text-ink">{total}</span> chứng từ
          {showExported ? " mới nhất." : " cũ nhất. Xuất xong lô này, danh sách sẽ tự hiện tiếp phần còn lại."}
        </p>
      )}

      {(error || exportError) && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {exportError ?? error}
        </p>
      )}

      {!loading && invoices.length === 0 ? (
        <div className="mt-8 rounded-md border border-line bg-surface px-6 py-10 text-center text-sm text-ink/50">
          {showExported
            ? "Chưa xuất chứng từ nào."
            : "Chưa có chứng từ nào sẵn sàng xuất. Tải hóa đơn lên và kiểm tra xong sẽ hiện ở đây."}
        </div>
      ) : (
        invoices.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium text-ink/50">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(invoices.map((i) => i.id)))}
                      className="accent-action"
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="px-4 py-2.5">Số chứng từ</th>
                  <th className="px-4 py-2.5">Ngày</th>
                  <th className="px-4 py-2.5">Khách hàng</th>
                  <th className="px-4 py-2.5 text-right">Tổng thanh toán</th>
                  <th className="px-4 py-2.5">Độ tin cậy</th>
                  <th className="px-4 py-2.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-page/60">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                        className="accent-action"
                        aria-label={`Chọn chứng từ ${inv.data?.so_chung_tu ?? inv.file_name}`}
                      />
                    </td>
                    <td className="tabular px-4 py-3">{inv.data?.so_chung_tu}</td>
                    <td className="tabular px-4 py-3 text-ink/70">{formatDate(inv.data?.ngay_chung_tu)}</td>
                    <td className="max-w-72 truncate px-4 py-3">{inv.data?.khach_hang?.ten}</td>
                    <td className="tabular px-4 py-3 text-right font-medium">
                      {formatVnd(inv.data?.tong_hop?.tong_tien_thanh_toan)}
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge score={inv.overall_confidence} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <div className="mt-6 flex items-center justify-between rounded-md border border-line bg-surface px-5 py-4">
        <div className="text-sm text-ink/70">
          Đã chọn <span className="tabular font-medium text-ink">{selectedIds.length}</span> chứng từ, tổng{" "}
          <span className="tabular font-medium text-ink">{formatVnd(selectedTotal)}</span>
        </div>
        <button
          onClick={handleExport}
          disabled={selectedIds.length === 0 || exporting}
          className="flex items-center gap-2 rounded-md bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-action/30 transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {exporting ? "Đang xuất..." : "Xuất Excel"}
        </button>
      </div>
    </div>
  );
}
