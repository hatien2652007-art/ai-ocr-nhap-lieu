import { STATUS_LABELS } from "../invoiceFormat";

export default function StatusText({ status }) {
  const label = STATUS_LABELS[status] ?? { text: status, className: "text-ink/50" };
  return <span className={`text-xs font-medium ${label.className}`}>{label.text}</span>;
}
