import { useEffect, useState } from "react";
import { listInvoices } from "./api";
import { STATUS } from "./invoiceFormat";

const POLL_INTERVAL_MS = 3000;
const ERROR_RETRY_MS = 10000;

/**
 * Tải danh sách hóa đơn theo trạng thái. Khi còn hóa đơn đang xử lý OCR thì tự
 * tải lại mỗi 3 giây cho tới khi xử lý xong. Gọi reload() sau khi upload/sửa/xuất.
 * total > invoices.length nghĩa là danh sách đã bị cắt bớt.
 */
export function useInvoices(statuses, order = "newest") {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const statusKey = statuses?.join(",") ?? "";

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function load() {
      try {
        const result = await listInvoices(statusKey ? statusKey.split(",") : [], order);
        if (cancelled) return;
        setInvoices(result.invoices);
        setTotal(result.total);
        setError(null);
        if (result.invoices.some((r) => r.status === STATUS.PROCESSING)) {
          timer = setTimeout(load, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        // Backend tạm mất kết nối (ví dụ đang khởi động lại): tự thử lại, chậm hơn
        timer = setTimeout(load, ERROR_RETRY_MS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [statusKey, order, version]);

  return { invoices, total, loading, error, reload: () => setVersion((v) => v + 1) };
}
