import { useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Users, UserX, Repeat, TrendingUp, Newspaper, ExternalLink, LayoutDashboard, Activity } from "lucide-react";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { ArnFilter } from "../components/ui/ArnFilter";
import { Amount } from "../components/ui/Amount";
import { Pager } from "../components/ui/Pager";
import { useArnProfiles, useDashboardSummary, useRecentClients } from "../hooks/useDashboard";
import { formatCount, formatDate, formatInrCompact, formatInrExact } from "../lib/format";
import { mockNotices } from "../lib/mock-dashboard-data";

export function DashboardPage() {
  const [selectedArnIds, setSelectedArnIds] = useState<string[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const { data: arnProfiles } = useArnProfiles();
  const { data, isLoading, isError } = useDashboardSummary(selectedArnIds);
  const { data: recentClients, isLoading: recentLoading } = useRecentClients(selectedArnIds, recentPage);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader icon={LayoutDashboard} accent="series-1" title="Dashboard">
          <p className="text-sm text-ink-secondary">
            {isError ? "Could not load live data." : "Live data from your onboarded RTA feeds."}
          </p>
        </PageHeader>
        {arnProfiles && (
          <ArnFilter arnProfiles={arnProfiles} selectedIds={selectedArnIds} onChange={setSelectedArnIds} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Total AUM"
          value={isLoading || !data ? "—" : formatInrCompact(data.totalAum)}
          subValue={isLoading || !data ? undefined : formatInrExact(data.totalAum)}
          icon={Wallet}
          accent="series-1"
          href="/reports"
        />
        <StatTile
          label="Live AUM (today's NAV)"
          value={isLoading || !data ? "—" : data.liveAum === null ? "N/A" : formatInrCompact(data.liveAum)}
          subValue={isLoading || !data || data.liveAum === null ? undefined : formatInrExact(data.liveAum)}
          icon={Activity}
          accent="series-6"
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
          subValue={isLoading || !data ? undefined : formatInrExact(data.monthlySipValue)}
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
                    <span className="text-ink">{amc.amcName}</span>
                    <Amount value={amc.aum} className="tabular-nums text-ink-secondary" />
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
                    <Amount value={client.aum} className="tabular-nums text-ink-secondary" />
                  </li>
                ))
              ) : (
                <li className="py-2 text-sm text-ink-muted">{isLoading ? "Loading…" : "No data yet."}</li>
              )}
            </ul>
          </Card>

          <Card title="Newly Added Clients">
            <p className="mb-2 text-xs text-ink-muted">Sorted by onboarding date, newest first — which ARN(s) each client's folios belong to.</p>
            <ul className="divide-y divide-[var(--gridline)]">
              {recentLoading && <li className="py-2 text-sm text-ink-muted">Loading…</li>}
              {recentClients?.clients.length === 0 && <li className="py-2 text-sm text-ink-muted">No data yet.</li>}
              {recentClients?.clients.map((client) => (
                <li key={client.id} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/crm/${client.id}`} className="text-series-1 hover:underline">{client.name}</Link>
                  <span className="text-ink-secondary">
                    {client.arnNumbers.length > 0 ? client.arnNumbers.map((a) => `ARN-${a}`).join(", ") : "Not yet attributed"}
                  </span>
                  <span className="tabular-nums text-ink-muted">{formatDate(client.createdAt)}</span>
                </li>
              ))}
            </ul>
            {recentClients && <Pager page={recentPage} setPage={setRecentPage} total={recentClients.total} pageSize={recentClients.pageSize} />}
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
