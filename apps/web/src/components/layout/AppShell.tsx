import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "../../lib/nav-config";
import { useLogout, useMe } from "../../hooks/useAuth";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();

  return (
    <div data-app-shell className="flex h-screen overflow-hidden bg-page text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-surface">
        <div className="flex h-14 items-center px-5 text-sm font-semibold tracking-wide text-ink">
          MFD Platform
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
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
              {item.comingSoon && (
                <span className="rounded-full bg-[var(--gridline)] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                  soon
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b border-[var(--border)] bg-surface px-6">
          {me && <span className="text-sm text-ink-secondary">{me.name}</span>}
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
