import { NavLink, Outlet } from "react-router-dom";
import { Upload, ListChecks, FileSpreadsheet, ScanLine } from "lucide-react";

const navItems = [
  { to: "/", label: "Tải chứng từ", icon: Upload },
  { to: "/kiem-tra", label: "Cần kiểm tra lại", icon: ListChecks },
  { to: "/xuat-excel", label: "Xuất Excel", icon: FileSpreadsheet },
];

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-line bg-ink px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2">
          <ScanLine className="h-5 w-5 text-white" />
          <span className="font-semibold text-white">OCR Nhập Liệu</span>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-l-warn-border bg-white/10 font-medium text-white"
                    : "border-l-transparent text-white/60 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
