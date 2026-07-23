import { useState } from "react";
import { Wallet, Users, UserX, Repeat, TrendingUp, Newspaper, ExternalLink } from "lucide-react";
import { StatTile } from "../components/ui/StatTile";
import { Card } from "../components/ui/Card";
import { ArnFilter } from "../components/ui/ArnFilter";
import { useArnProfiles, useDashboardSummary } from "../hooks/useDashboard";
import { formatCount, formatDate, formatInrCompact } from "../lib/format";
import { mockNotices } from "../lib/mock-dashboard-data";

export function DashboardPage() {
  const [selectedArnIds, setSelectedArnIds] = useState<string[]>([]);
  const { data: arnProfiles } = useArnProfiles();
  const { data, isLoading, isError } = useDashboardSummary(selectedArnIds);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-secondary">
            {isError ? "Could not load live data." : "Live data from your onboarded RTA feeds."}
          </p>
        </div>
        {arnProfiles && (
          <ArnFilter arnProfiles={arnProfiles} selectedIds={selectedArnIds} onChange={setSelectedArnIds} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Total AUM"
          value={isLoading || !data ? "—" : formatInrCompact(data.totalAum)}
          icon={Wallet}
          accent="series-1"
          href="/reports"
        />
        <StatTile
          label="Total Clients"
          value={isLoading || !data ? "—" : formatCount(data.totalClients)}
          icon={Users}
          accent="series-2"
          href="/crm"
        />
        <StatTile
          label="Non-PAN Clients"
          value={isLoading || !data ? "—" : formatCount(data.nonPanClients)}
          icon={UserX}
          accent="series-4"
          href="/mis"
        />
        <StatTile
          label="Active SIP Value"
          value={isLoading || !data ? "—" : formatInrCompact(data.monthlySipValue)}
          icon={TrendingUp}
          accent="series-5"
          href="/reports"
        />
        <StatTile
          label="Active SIPs"
          value={isLoading || !data ? "—" : formatCount(data.activeSips)}
          icon={Repeat}
          accent="series-1"
          href="/reports"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Top AMCs by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {data?.topAmcs.length ? (
                data.topAmcs.map((amc) => (
                  <li key={amc.amcCode} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">
                      {amc.sampleSchemeName ? amc.sampleSchemeName.split(" - ")[0] : amc.amcCode}
                      <span className="ml-1 text-xs text-ink-muted">({amc.amcCode})</span>
                    </span>
                    <span className="tabular-nums text-ink-secondary">{formatInrCompact(amc.aum)}</span>
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
            </ul>
          </Card>

          <Card title="Top Clients by AUM">
            <ul className="divide-y divide-[var(--gridline)]">
              {data?.topClients.length ? (
                data.topClients.map((client) => (
                  <li key={client.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">{client.name}</span>
                    <span className="tabular-nums text-ink-secondary">{formatInrCompact(client.aum)}</span>
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
            </ul>
          </Card>

          <Card title="Newly Added Clients">
            <ul className="divide-y divide-[var(--gridline)]">
              {data?.recentClients.length ? (
                data.recentClients.map((client) => (
                  <li key={client.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink">{client.name}</span>
                    <span className="text-ink-secondary">{client.transactionType ?? "—"}</span>
                    <span className="tabular-nums text-ink-muted">{formatDate(client.date)}</span>
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
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
