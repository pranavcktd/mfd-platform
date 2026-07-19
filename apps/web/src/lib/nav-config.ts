import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LineChart,
  Percent,
  Users,
  FileWarning,
  ArrowLeftRight,
  Wallet,
  UploadCloud,
  FileText,
  Wrench,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Analysis", path: "/analysis", icon: LineChart, comingSoon: true },
  { label: "Brokerage", path: "/brokerage", icon: Percent, comingSoon: true },
  { label: "CRM", path: "/crm", icon: Users, comingSoon: true },
  { label: "MIS", path: "/mis", icon: FileWarning, comingSoon: true },
  { label: "Online Transaction", path: "/online-transaction", icon: ArrowLeftRight, comingSoon: true },
  { label: "Other Assets", path: "/other-assets", icon: Wallet, comingSoon: true },
  { label: "Import External Data", path: "/import-external-data", icon: UploadCloud, comingSoon: true },
  { label: "Reports", path: "/reports", icon: FileText, comingSoon: true },
  { label: "Tools", path: "/tools", icon: Wrench, comingSoon: true },
];
