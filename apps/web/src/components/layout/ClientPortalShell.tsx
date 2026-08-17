import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Wallet, ArrowLeftRight, Receipt, UserCircle, LogOut, TrendingUp } from "lucide-react";
import { useClientPortalLogout, useClientPortalMe } from "../../hooks/useClientPortal";

const NAV_ITEMS = [
  { label: "Overview", path: "/client-portal", icon: LayoutDashboard, end: true },
  { label: "Holdings", path: "/client-portal/holdings", icon: Wallet, end: false },
  { label: "Transactions", path: "/client-portal/transactions", icon: ArrowLeftRight, end: false },
  { label: "Capital Gains", path: "/client-portal/capital-gains", icon: Receipt, end: false },
  { label: "Profile", path: "/client-portal/profile", icon: UserCircle, end: false },
];

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const logout = useClientPortalLogout();
  const { data: me } = useClientPortalMe();

  return (
    <div className="flex h-screen overflow-hidden bg-page text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-surface">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <div className="rounded-md bg-series-1/10 p-1.5">
            <TrendingUp size={16} className="text-series-1" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold tracking-wide text-ink">Investor Portal</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
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
          {me && <span className="text-sm text-ink-secondary">{me.name}</span>}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-secondary transition-colors hover:bg-[var(--gridline)]/50 hover:text-ink"
          >
            <LogOut size={15} />
            Log out
          </button>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
