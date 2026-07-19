import { Wallet, Users, UserX, Repeat, TrendingUp, Newspaper, ExternalLink } from "lucide-react";
import { StatTile } from "../components/ui/StatTile";
import { Card } from "../components/ui/Card";
import {
  mockKpis,
  mockNotices,
  mockRecentClients,
  mockTopAmcs,
  mockTopClients,
} from "../lib/mock-dashboard-data";

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-ink-secondary">Placeholder data — no live database connected yet.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total AUM" value={mockKpis.totalAum} icon={Wallet} accent="series-1" href="/reports" />
        <StatTile label="Total Clients" value={mockKpis.totalClients} icon={Users} accent="series-2" href="/crm" />
        <StatTile label="Non-PAN Clients" value={mockKpis.nonPanClients} icon={UserX} accent="series-4" href="/mis" />
        <StatTile
          label="Monthly SIP Value"
          value={mockKpis.monthlySipValue}
          icon={TrendingUp}
          accent="series-5"
          href="/reports"
        />
        <StatTile label="Active SIPs" value={mockKpis.activeSips} icon={Repeat} accent="series-1" href="/reports" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Top AMCs by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {mockTopAmcs.map((amc) => (
                <li key={amc.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{amc.name}</span>
                  <span className="tabular-nums text-ink-secondary">{amc.aum}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Top Clients by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {mockTopClients.map((client) => (
                <li key={client.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{client.name}</span>
                  <span className="tabular-nums text-ink-secondary">{client.aum}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Newly Added Clients">
            <ul className="divide-y divide-[var(--gridline)]">
              {mockRecentClients.map((client) => (
                <li key={client.name} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{client.name}</span>
                  <span className="text-ink-secondary">{client.transactionType}</span>
                  <span className="tabular-nums text-ink-muted">{client.date}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Notices & Market Buzz"
            action={<Newspaper size={15} className="text-ink-muted" />}
          >
            <ul className="space-y-3">
              {mockNotices.map((notice) => (
                <li key={notice.title} className="text-sm">
                  <p className="text-ink">{notice.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{notice.date}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Quick Links">
            <ul className="space-y-2">
              {["Add New Client", "Upload Other Assets", "Financial Calculators", "Scheduler"].map((link) => (
                <li key={link}>
                  <a href="#" className="flex items-center gap-1.5 text-sm text-series-1 hover:underline">
                    {link}
                    <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
