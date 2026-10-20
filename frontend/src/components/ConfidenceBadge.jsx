import { isLowConfidence } from "../invoiceFormat";

export default function ConfidenceBadge({ score, size = "sm" }) {
  if (score == null || Number.isNaN(Number(score))) {
    return <span className="text-xs text-ink/30">—</span>;
  }

  const pct = Math.round(Number(score) * 100);
  const low = isLowConfidence(Number(score));
  const padding = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm";

  return (
    <span
      className={`tabular inline-flex items-center rounded border-2 font-semibold ${padding} ${
        low
          ? "bg-warn-bg border-warn-border text-warn"
          : "bg-good-bg border-good-border text-good"
      }`}
    >
      {pct}%
    </span>
  );
}
