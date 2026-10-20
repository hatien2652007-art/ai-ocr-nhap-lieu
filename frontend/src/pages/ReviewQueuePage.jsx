import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoices } from "../useInvoices";
import { STATUS, formatVnd } from "../invoiceFormat";
import ConfidenceBadge from "../components/ConfidenceBadge";
import StatusText from "../components/StatusText";

const QUEUE_STATUSES = [STATUS.NEEDS_REVIEW, STATUS.ERROR];

export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const [sortLowFirst, setSortLowFirst] = useState(true);
  const { invoices, total, loading, error } = useInvoices(QUEUE_STATUSES, "oldest");

  const sorted = [...invoices].sort((a, b) => {
    const diff = (a.overall_confidence ?? -1) - (b.overall_confidence ?? -1);
    return sortLowFirst ? diff : -diff;
  });

  return (
    <div className="px-8 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Cần kiểm tra lại</h1>
          <p className="mt-1 text-sm text-ink/60">
            Độ tin cậy dưới 70%, số liệu không khớp, hoặc không đọc được. Kiểm tra và xác nhận trước khi xuất Excel.
          </p>
        </div>
        <span className="tabular rounded-md border-2 border-warn-border bg-warn-bg px-3 py-1.5 text-sm font-medium text-warn">
          {total} chứng từ
        </span>
      </div>

      {total > invoices.length && (
        <p className="mt-4 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink/70">
          Đang hiện <span className="tabular font-medium text-ink">{invoices.length}</span> chứng từ cũ nhất. Kiểm tra
          xong lô này, danh sách sẽ tự hiện tiếp phần còn lại.
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>
      )}

      {!loading && !error && sorted.length === 0 ? (
        <div className="mt-8 rounded-md border border-line bg-surface px-6 py-10 text-center text-sm text-ink/50">
          Không có chứng từ nào cần kiểm tra lại.
        </div>
      ) : (
        sorted.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium text-ink/50">
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5">Số chứng từ</th>
                  <th className="px-4 py-2.5">Khách hàng</th>
                  <th className="px-4 py-2.5 text-right">Tổng thanh toán</th>
                  <th className="px-4 py-2.5">
                    <button onClick={() => setSortLowFirst((v) => !v)} className="font-medium hover:text-ink">
                      Độ tin cậy {sortLowFirst ? "↑" : "↓"}
                    </button>
                  </th>
                  <th className="px-4 py-2.5">Vấn đề</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((inv) => (
                  <tr key={inv.id} className="hover:bg-page/60">
                    <td className="max-w-48 truncate px-4 py-3 text-ink/70">{inv.file_name}</td>
                    <td className="tabular px-4 py-3">{inv.data?.so_chung_tu ?? "—"}</td>
                    <td className="max-w-64 truncate px-4 py-3">{inv.data?.khach_hang?.ten ?? "—"}</td>
                    <td className="tabular px-4 py-3 text-right font-medium">
                      {inv.data ? formatVnd(inv.data.tong_hop?.tong_tien_thanh_toan) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge score={inv.overall_confidence} />
                    </td>
                    <td className="max-w-64 px-4 py-3 text-xs text-ink/60">
                      {inv.status === STATUS.ERROR ? (
                        <StatusText status={inv.status} />
                      ) : (
                        (inv.warnings?.[0] ?? "Độ tin cậy thấp")
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/kiem-tra/${inv.id}`)}
                        className="text-sm font-medium text-action hover:text-action-hover"
                      >
                        Kiểm tra
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
