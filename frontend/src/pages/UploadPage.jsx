import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadCloud, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { uploadInvoices, retryInvoice } from "../api";
import { useInvoices } from "../useInvoices";
import { STATUS, formatVnd } from "../invoiceFormat";
import StatusText from "../components/StatusText";
import ConfidenceBadge from "../components/ConfidenceBadge";

const RECENT_LIMIT = 20;

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [retryingIds, setRetryingIds] = useState(() => new Set());
  const inputRef = useRef(null);
  const { invoices, error, reload } = useInvoices();

  const recent = invoices.slice(0, RECENT_LIMIT);
  const processingCount = invoices.filter((i) => i.status === STATUS.PROCESSING).length;
  const needsReviewCount = invoices.filter((i) => i.status === STATUS.NEEDS_REVIEW).length;

  async function handleFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setMessage(null);
    try {
      const { created, rejected } = await uploadInvoices(files);
      setMessage({
        kind: rejected.length > 0 ? "warn" : "good",
        text: `Đã nhận ${created.length} file.`,
        rejected,
      });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err.message, rejected: [] });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRetry(id) {
    if (retryingIds.has(id)) return;
    setRetryingIds((prev) => new Set(prev).add(id));
    try {
      await retryInvoice(id);
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: err.message, rejected: [] });
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold text-ink">Tải chứng từ lên</h1>
      <p className="mt-1 text-sm text-ink/60">
        Kéo thả hoặc chọn hóa đơn bán hàng dạng PDF, JPG, PNG. Hệ thống tự đọc và trích xuất dữ liệu.
      </p>

      {(processingCount > 0 || needsReviewCount > 0) && (
        <div className="mt-4 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink/70">
          {processingCount > 0 && (
            <>
              Đang xử lý <span className="tabular font-medium text-ink">{processingCount}</span> chứng từ.{" "}
            </>
          )}
          {needsReviewCount > 0 && (
            <>
              Có <span className="tabular font-medium text-warn">{needsReviewCount}</span> chứng từ{" "}
              <Link to="/kiem-tra" className="font-medium text-action hover:text-action-hover">
                cần kiểm tra lại
              </Link>
              .
            </>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action/40 ${
          isDragging ? "border-action bg-action/5" : "border-line bg-surface hover:border-action/40"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-action motion-reduce:animate-none" />
        ) : (
          <UploadCloud className="h-10 w-10 text-ink/30" />
        )}
        <p className="mt-3 text-sm font-medium text-ink">
          {uploading ? "Đang tải lên..." : "Thả file vào đây, hoặc bấm để chọn"}
        </p>
        <p className="mt-1 text-xs text-ink/50">PDF, JPG, PNG, WEBP. Tối đa 20MB mỗi file, 50 file mỗi lần</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {message && (
        <div
          role="status"
          className={`mt-4 rounded-md border px-4 py-2.5 text-sm ${
            message.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : message.kind === "warn"
                ? "border-warn-border bg-warn-bg text-warn"
                : "border-good-border bg-good-bg text-good"
          }`}
        >
          <p>{message.text}</p>
          {message.rejected.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {message.rejected.map((r, i) => (
                <li key={i}>
                  {r.file_name}: {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>
      )}

      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-ink/70">Tải lên gần đây</h2>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
            {recent.map((inv) => {
              const Icon = inv.file_name.toLowerCase().endsWith(".pdf") ? FileText : ImageIcon;
              const total = inv.data?.tong_hop?.tong_tien_thanh_toan;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-ink/40" />
                  {inv.status === STATUS.PROCESSING ? (
                    <span className="flex-1 truncate text-sm text-ink">{inv.file_name}</span>
                  ) : (
                    <Link
                      to={`/kiem-tra/${inv.id}`}
                      className="flex-1 truncate text-sm text-ink hover:text-action"
                    >
                      {inv.file_name}
                    </Link>
                  )}
                  {total != null && (
                    <span className="tabular text-sm text-ink/70">{formatVnd(total)}</span>
                  )}
                  <ConfidenceBadge score={inv.overall_confidence} />
                  <StatusText status={inv.status} />
                  {inv.status === STATUS.ERROR && (
                    <button
                      onClick={() => handleRetry(inv.id)}
                      disabled={retryingIds.has(inv.id)}
                      className="text-xs font-medium text-action hover:text-action-hover disabled:opacity-40"
                    >
                      Thử lại
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
