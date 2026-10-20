// Lớp gọi API backend. Mọi lỗi được ném ra dưới dạng Error có message tiếng Việt
// lấy từ backend, để giao diện hiển thị thẳng cho người dùng.
//
// Lúc dev (npm run dev), đường dẫn tương đối "/api" được proxy sang backend local
// (xem vite.config.js). Lúc deploy (ví dụ lên Vercel), không có proxy đó, nên cần
// biến môi trường VITE_API_URL trỏ thẳng vào backend đang chạy ở nơi khác.
const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, options);
  } catch {
    throw new Error("Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Máy chủ trả lỗi ${response.status}`);
  }
  return response;
}

export async function uploadInvoices(files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const response = await fetch(`${API_BASE}/api/invoices`, { method: "POST", body: form }).catch(() => {
    throw new Error("Không kết nối được máy chủ. Kiểm tra backend đã chạy chưa.");
  });
  const body = await response.json().catch(() => null);
  // 400 vẫn có thể chứa danh sách file bị từ chối kèm lý do
  if (!response.ok && !body?.rejected) throw new Error(body?.error ?? `Máy chủ trả lỗi ${response.status}`);
  return body;
}

/** order: "newest" (mặc định) hoặc "oldest". Trả về { invoices, total }. */
export async function listInvoices(statuses, order = "newest") {
  const params = new URLSearchParams({ order });
  if (statuses?.length) params.set("status", statuses.join(","));
  return (await request(`/invoices?${params}`)).json();
}

export async function getInvoice(id) {
  return (await request(`/invoices/${id}`)).json();
}

/** expectedUpdatedAt: updated_at lúc mở hóa đơn, để server phát hiện đã bị sửa ở nơi khác. */
export async function saveReview(id, data, expectedUpdatedAt) {
  return (
    await request(`/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, expected_updated_at: expectedUpdatedAt }),
    })
  ).json();
}

export async function retryInvoice(id) {
  return (await request(`/invoices/${id}/retry`, { method: "POST" })).json();
}

/** Tải file Excel về máy người dùng. */
export async function exportExcel(ids) {
  const response = await request("/invoices/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "MISA-ban-hang.xlsx";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Thu hồi muộn để trình duyệt kịp bắt đầu tải
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
