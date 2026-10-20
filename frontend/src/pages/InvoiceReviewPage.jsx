import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ZoomIn, ZoomOut, AlertTriangle, Loader2 } from "lucide-react";
import { getInvoice, saveReview, retryInvoice } from "../api";
import { STATUS, isLowConfidence, parseVnNumber, formatVnNumber } from "../invoiceFormat";
import ConfidenceBadge from "../components/ConfidenceBadge";
import StatusText from "../components/StatusText";

/**
 * Ô nhập số kiểu Việt Nam (1.500.000 hoặc 2,35). Giữ nguyên chữ người dùng gõ.
 * Gõ sai định dạng thì viền đỏ và báo onValidChange(false) để khóa nút lưu,
 * không âm thầm đổi thành 0.
 */
function NumberInput({ id, label, value, onChange, onValidChange, low }) {
  const [text, setText] = useState(formatVnNumber(value));
  const invalid = parseVnNumber(text) === null;
  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={invalid}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const parsed = parseVnNumber(e.target.value);
        setText(e.target.value);
        onValidChange(id, parsed !== null);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parseVnNumber(text);
        if (parsed !== null) setText(formatVnNumber(parsed));
      }}
      className={`tabular w-full rounded-md border px-2.5 py-1.5 text-right text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action/30 ${
        invalid
          ? "border-red-500 bg-red-50"
          : low
            ? "border-warn-border bg-warn-bg/40"
            : "border-line bg-surface"
      }`}
    />
  );
}

function Field({ id, label, confidence, children, hint }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-ink/60">
          {label}
        </label>
        {confidence != null && <ConfidenceBadge score={confidence} />}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  );
}

function TextInput({ id, value, onChange, low }) {
  return (
    <input
      id={id}
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action/30 ${
        low ? "border-warn-border bg-warn-bg/40" : "border-line bg-surface"
      }`}
    />
  );
}

function FilePreview({ url, isPdf }) {
  const [zoom, setZoom] = useState(1);
  if (!url) {
    return <p className="p-8 text-center text-sm text-ink/40">Không tải được file gốc.</p>;
  }
  if (isPdf) {
    return <iframe src={url} title="File hóa đơn gốc" className="h-full w-full border-0" />;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-1 border-b border-line bg-surface px-3 py-2">
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="rounded p-1.5 text-ink/50 hover:bg-page"
          aria-label="Thu nhỏ"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="tabular w-12 text-center text-xs text-ink/50">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="rounded p-1.5 text-ink/50 hover:bg-page"
          aria-label="Phóng to"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <img
          src={url}
          alt="Ảnh hóa đơn gốc"
          style={{ width: `${zoom * 100}%` }}
          className="mx-auto max-w-none border border-line bg-surface"
        />
      </div>
    </div>
  );
}

export default function InvoiceReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  // id các ô số đang gõ sai định dạng; còn ô nào sai thì không cho lưu
  const [invalidFields, setInvalidFields] = useState(() => new Set());

  function handleValidChange(fieldId, valid) {
    setInvalidFields((prev) => {
      if (valid === !prev.has(fieldId)) return prev;
      const next = new Set(prev);
      if (valid) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    getInvoice(id)
      .then((inv) => {
        if (cancelled) return;
        setInvoice(inv);
        setDraft(inv.data ? structuredClone(inv.data) : null);
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <div className="px-8 py-10">
        <p className="text-sm text-red-800">{loadError}</p>
        <Link to="/kiem-tra" className="mt-2 inline-block text-sm text-action">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-action motion-reduce:animate-none" />
      </div>
    );
  }

  const conf = invoice.data?.ocr_meta?.field_confidence ?? {};
  const isPdf = invoice.mime_type === "application/pdf";
  const canEdit = draft && invoice.status !== STATUS.PROCESSING;
  const hasInvalid = invalidFields.size > 0;

  function set(path, value) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      let target = next;
      for (const key of path.slice(0, -1)) target = target[key] ??= {};
      target[path.at(-1)] = value;
      return next;
    });
  }

  function setItem(index, key, value) {
    setDraft((prev) => {
      const next = structuredClone(prev);
      next.hang_hoa[index][key] = value;
      return next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    setSaveError(null);
    try {
      // Gửi kèm updated_at đã đọc: nếu hóa đơn đã bị thay đổi ở nơi khác, server từ chối
      await saveReview(invoice.id, draft, invoice.updated_at);
      navigate("/kiem-tra");
    } catch (err) {
      setSaveError(err.message);
      setSaving(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryInvoice(invoice.id);
      navigate("/");
    } catch (err) {
      setSaveError(err.message);
      setRetrying(false);
    }
  }

  const items = draft?.hang_hoa ?? [];
  const lowCount = Object.values(conf).filter(isLowConfidence).length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/kiem-tra"
            className="rounded p-1 text-ink/50 hover:bg-page hover:text-ink"
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-ink">{invoice.file_name}</h1>
            <p className="flex items-center gap-2 text-xs text-ink/50">
              <StatusText status={invoice.status} />
              {lowCount > 0 && <span>{lowCount} trường có độ tin cậy thấp</span>}
            </p>
          </div>
        </div>
        {invoice.status === STATUS.ERROR ? (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded-md bg-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {retrying ? "Đang gửi..." : "Đọc lại hóa đơn"}
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={!canEdit || saving || hasInvalid}
            title={hasInvalid ? "Có ô số nhập sai định dạng" : undefined}
            className="rounded-md bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-action/30 transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Đang lưu..." : "Xác nhận đã kiểm tra"}
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-line bg-ink/5">
          <FilePreview url={invoice.file_url} isPdf={isPdf} />
        </div>

        <div className="w-1/2 overflow-y-auto px-6 py-6">
          {hasInvalid && (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
              Có ô số nhập sai định dạng (viền đỏ). Gõ số kiểu 1.500.000 hoặc 2,35.
            </p>
          )}

          {saveError && (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
              {saveError}
            </p>
          )}

          {invoice.error_message && (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
              {invoice.error_message}
            </p>
          )}

          {invoice.warnings?.length > 0 && (
            <div className="mb-6 rounded-md border-2 border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Cần xem kỹ
              </p>
              <ul className="mt-1 list-disc pl-6">
                {invoice.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {draft && (
            <div className="flex flex-col gap-8">
              <section>
                <h2 className="mb-3 text-sm font-semibold text-ink">Chứng từ</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Field id="so_chung_tu" label="Số chứng từ" confidence={conf.so_chung_tu}>
                    <TextInput
                      id="so_chung_tu"
                      value={draft.so_chung_tu}
                      onChange={(v) => set(["so_chung_tu"], v)}
                      low={isLowConfidence(conf.so_chung_tu)}
                    />
                  </Field>
                  <Field
                    id="ngay_chung_tu"
                    label="Ngày chứng từ"
                    confidence={conf.ngay_chung_tu}
                    hint="Dạng năm-tháng-ngày, ví dụ 2024-08-07"
                  >
                    <TextInput
                      id="ngay_chung_tu"
                      value={draft.ngay_chung_tu}
                      onChange={(v) => set(["ngay_chung_tu"], v)}
                      low={isLowConfidence(conf.ngay_chung_tu)}
                    />
                  </Field>
                  <Field id="hinh_thuc_thanh_toan" label="Hình thức thanh toán">
                    <select
                      id="hinh_thuc_thanh_toan"
                      value={draft.hinh_thuc_thanh_toan ?? "chua_thu_tien"}
                      onChange={(e) => set(["hinh_thuc_thanh_toan"], e.target.value)}
                      className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action/30"
                    >
                      <option value="chua_thu_tien">Chưa thu tiền</option>
                      <option value="thu_tien_ngay">Thu tiền ngay</option>
                    </select>
                  </Field>
                  <Field id="dien_giai" label="Diễn giải">
                    <TextInput id="dien_giai" value={draft.dien_giai} onChange={(v) => set(["dien_giai"], v)} />
                  </Field>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-ink">Khách hàng</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field id="kh_ten" label="Tên khách hàng" confidence={conf.khach_hang_ten}>
                      <TextInput
                        id="kh_ten"
                        value={draft.khach_hang?.ten}
                        onChange={(v) => set(["khach_hang", "ten"], v)}
                        low={isLowConfidence(conf.khach_hang_ten)}
                      />
                    </Field>
                  </div>
                  <Field id="kh_mst" label="Mã số thuế" confidence={conf.khach_hang_mst}>
                    <TextInput
                      id="kh_mst"
                      value={draft.khach_hang?.mst}
                      onChange={(v) => set(["khach_hang", "mst"], v)}
                      low={isLowConfidence(conf.khach_hang_mst)}
                    />
                  </Field>
                  <Field id="kh_ma" label="Mã khách hàng trong MISA" hint="Để trống sẽ dùng mã số thuế">
                    <TextInput
                      id="kh_ma"
                      value={draft.khach_hang?.ma_khach_hang}
                      onChange={(v) => set(["khach_hang", "ma_khach_hang"], v)}
                    />
                  </Field>
                  <div className="col-span-2">
                    <Field id="kh_dia_chi" label="Địa chỉ" confidence={conf.khach_hang_dia_chi}>
                      <TextInput
                        id="kh_dia_chi"
                        value={draft.khach_hang?.dia_chi}
                        onChange={(v) => set(["khach_hang", "dia_chi"], v)}
                        low={isLowConfidence(conf.khach_hang_dia_chi)}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Hàng hóa ({items.length} dòng)</h2>
                  {conf.hang_hoa != null && <ConfidenceBadge score={conf.hang_hoa} />}
                </div>
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-page text-left text-xs font-medium text-ink/50">
                        <th className="px-2 py-2">Tên hàng</th>
                        <th className="w-20 px-2 py-2 text-right">Số lượng</th>
                        <th className="w-32 px-2 py-2 text-right">Đơn giá</th>
                        <th className="w-16 px-2 py-2 text-right">% thuế</th>
                        <th className="w-32 px-2 py-2 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {items.map((item, i) => {
                        const expected = (item.so_luong ?? 0) * (item.don_gia ?? 0);
                        const mismatch = item.thanh_tien != null && Math.abs(expected - item.thanh_tien) > 1;
                        return (
                          <tr key={i}>
                            <td className="px-2 py-1.5">
                              <input
                                aria-label={`Tên hàng dòng ${i + 1}`}
                                value={item.ten_hang ?? ""}
                                onChange={(e) => setItem(i, "ten_hang", e.target.value)}
                                className="w-full rounded border border-line px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-action/30"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberInput
                                id={`sl-${i}`}
                                label={`Số lượng dòng ${i + 1}`}
                                value={item.so_luong}
                                onChange={(v) => setItem(i, "so_luong", v)}
                                onValidChange={handleValidChange}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberInput
                                id={`dg-${i}`}
                                label={`Đơn giá dòng ${i + 1}`}
                                value={item.don_gia}
                                onChange={(v) => setItem(i, "don_gia", v)}
                                onValidChange={handleValidChange}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberInput
                                id={`ts-${i}`}
                                label={`Thuế suất dòng ${i + 1}`}
                                value={item.thue_suat}
                                onChange={(v) => setItem(i, "thue_suat", v)}
                                onValidChange={handleValidChange}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <NumberInput
                                id={`tt-${i}`}
                                label={`Thành tiền dòng ${i + 1}`}
                                value={item.thanh_tien}
                                onChange={(v) => setItem(i, "thanh_tien", v)}
                                onValidChange={handleValidChange}
                                low={mismatch}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-ink">Tổng hợp</h2>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["tong_tien_hang", "Tổng tiền hàng"],
                    ["tong_tien_thue_gtgt", "Tổng tiền thuế GTGT"],
                    ["tien_chiet_khau", "Tiền chiết khấu"],
                    ["tong_tien_thanh_toan", "Tổng tiền thanh toán"],
                  ].map(([key, label]) => (
                    <Field
                      key={key}
                      id={key}
                      label={label}
                      confidence={conf[key]}
                    >
                      <NumberInput
                        id={key}
                        label={label}
                        value={draft.tong_hop?.[key]}
                        onChange={(v) => set(["tong_hop", key], v)}
                        onValidChange={handleValidChange}
                        low={isLowConfidence(conf[key])}
                      />
                    </Field>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
