import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Users, UserPlus, MailCheck, FolderInput, Activity, ScrollText, Settings, LineChart } from "lucide-react";
import { clearAdminKey } from "../../lib/admin-api-client";

const NAV_ITEMS = [
  { label: "MFDs", path: "/super-admin", icon: Users },
  { label: "Onboard New MFD", path: "/super-admin/onboard", icon: UserPlus },
  { label: "Mail Sync", path: "/super-admin/mail-sync", icon: MailCheck },
  { label: "Since-Inception Import", path: "/super-admin/folder-import", icon: FolderInput },
  { label: "Equity ISIN Master", path: "/super-admin/equity-master", icon: LineChart },
  { label: "Platform Status", path: "/super-admin/status", icon: Activity },
  { label: "Audit Log", path: "/super-admin/audit-log", icon: ScrollText },
  { label: "Settings", path: "/super-admin/settings", icon: Settings },
];

export function SuperAdminShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  function logout() {
    clearAdminKey();
    navigate("/super-admin/login");
  }

  return (
    <div className="flex min-h-screen bg-page text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-surface">
        <div className="flex h-14 items-center px-5 text-sm font-semibold tracking-wide text-ink">
          Super Admin
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/super-admin"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-series-1/10 font-medium text-series-1"
                    : "text-ink-secondary hover:bg-[var(--gridline)]/50 hover:text-ink"
                }`
              }
            >
              <item.icon size={17} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b border-[var(--border)] bg-surface px-6">
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:bg-[var(--gridline)]/50 hover:text-ink"
          >
            <LogOut size={15} />
            Log out
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
