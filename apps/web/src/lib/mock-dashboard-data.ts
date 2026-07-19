// Placeholder data for UI development — the backend has no live database yet
// (see project notes). Shaped like real numbers observed while validating the
// ingestion pipeline (~₹28.9cr AUM, 558 clients, 711 active SIPs) but every
// name below is fabricated, not real client data.

export const mockKpis = {
  totalAum: "₹28.9 Cr",
  totalClients: "558",
  nonPanClients: "2",
  monthlySipValue: "₹33.7 L",
  activeSips: "711",
};

export const mockTopAmcs = [
  { name: "Nippon India Mutual Fund", aum: "₹6.4 Cr" },
  { name: "Aditya Birla Sun Life MF", aum: "₹5.1 Cr" },
  { name: "HDFC Mutual Fund", aum: "₹4.3 Cr" },
  { name: "UTI Mutual Fund", aum: "₹3.2 Cr" },
  { name: "SBI Mutual Fund", aum: "₹2.8 Cr" },
];

export const mockTopClients = [
  { name: "Client — R. Sharma", aum: "₹42.1 L" },
  { name: "Client — A. Verma", aum: "₹38.6 L" },
  { name: "Client — S. Iyer", aum: "₹31.4 L" },
  { name: "Client — P. Nair", aum: "₹27.9 L" },
  { name: "Client — K. Rao", aum: "₹24.2 L" },
];

export const mockRecentClients = [
  { name: "Client — M. Joshi", transactionType: "Purchase", date: "18 Jul 2026" },
  { name: "Client — D. Gupta", transactionType: "SIP Registration", date: "17 Jul 2026" },
  { name: "Client — N. Patel", transactionType: "Purchase", date: "16 Jul 2026" },
];

export const mockNotices = [
  { title: "AMFI: NAV cut-off timing update effective next cycle", date: "18 Jul 2026" },
  { title: "SEBI circular on mutual fund expense ratio disclosure", date: "15 Jul 2026" },
  { title: "New fund offer window opens for select debt schemes", date: "12 Jul 2026" },
];
