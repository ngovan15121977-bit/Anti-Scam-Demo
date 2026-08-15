import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import axiosInstance from "@/api/axios";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightLeft,
  ShieldAlert,
  BarChart3,
  Settings,
  Search,
  Ban,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Filter,
  Download,
  MoreVertical,
  FileClock,
  RefreshCw,
  Activity,
  Wifi,
  Pause,
  Play,
  Users,
} from "lucide-react";

type TabType = "overview" | "transactions" | "users" | "blacklist" | "audit" | "settings";

type AdminTransaction = {
  id: string;
  user_id: string;
  user_name: string;
  payee_account: string;
  payee_name: string;
  bank_code: string | null;
  amount: number;
  transaction_status: string;
  risk_level: "safe" | "low" | "medium" | "high" | null;
  created_at: string;
};

type AdminAuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type AdminStats = {
  total_transactions: number;
  by_risk_level: Record<string, number>;
  high_risk_count: number;
  high_risk_cancelled: number;
  recommendation_compliance_rate: number | null;
  blacklist_size: number;
  pattern_count: number;
};

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
};

type BlacklistEntry = {
  id: string;
  entity_type: string;
  entity_value: string;
  source: string;
  evidence?: Record<string, unknown> | null;
  created_at: string;
};

type BlacklistPage = {
  items: BlacklistEntry[];
  next_cursor: string | null;
};

function useAdminTransactions() {
  return useQuery({
    queryKey: ["admin-transactions"],
    queryFn: async () => (await axiosInstance.get<AdminTransaction[]>("/v1/admin/transactions", { params: { limit: 100 } })).data,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

type AdminTransactionsQuery = ReturnType<typeof useAdminTransactions>;

export default function AdminPage() {
  const navigate = useNavigate();
  const transactionsQuery = useAdminTransactions();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    { key: "overview" as TabType, label: "Tổng quan", icon: BarChart3 },
    { key: "transactions" as TabType, label: "Giao dịch", icon: ArrowRightLeft },
    { key: "users" as TabType, label: "Users", icon: Users },
    { key: "blacklist" as TabType, label: "Blacklist", icon: Ban },
    { key: "audit" as TabType, label: "Audit log", icon: FileClock },
    { key: "settings" as TabType, label: "Cài đặt AI", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-slate-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Quản trị Timi</h1>
            <p className="text-xs text-slate-400">Admin Dashboard</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? "bg-rose-500 text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === "overview" && <OverviewTab transactionsQuery={transactionsQuery} onViewAll={() => setActiveTab("transactions")} />}
        {activeTab === "transactions" && <TransactionsTab transactionsQuery={transactionsQuery} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
        {activeTab === "users" && <UsersTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
        {activeTab === "blacklist" && <BlacklistTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
        {activeTab === "audit" && <AuditTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ===== AUDIT TAB =====
function AuditTab() {
  const [action, setAction] = useState("");
  const [liveEnabled, setLiveEnabled] = useState(true);
  const auditQuery = useQuery<AdminAuditLog[]>({
    queryKey: ["admin-audit-logs", action],
    queryFn: async () => (await axiosInstance.get<AdminAuditLog[]>("/v1/admin/audit-logs", { params: { limit: 200, ...(action ? { action } : {}) } })).data,
    refetchInterval: liveEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const statsQuery = useQuery<AdminStats>({
    queryKey: ["admin-stats", "live-audit"],
    queryFn: async () => (await axiosInstance.get<AdminStats>("/v1/admin/stats")).data,
    refetchInterval: liveEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const logs = auditQuery.data ?? [];
  const actions = Array.from(new Set(logs.map((log) => log.action))).sort();
  const now = Date.now();
  const recentLogs = useMemo(
    () => logs.filter((log) => now - new Date(log.created_at).getTime() <= 5 * 60 * 1000),
    [logs, now],
  );
  const warningEvents = recentLogs.filter((log) =>
    /warning|risk|blacklist/i.test(log.action),
  ).length;
  const hitlEvents = recentLogs.filter((log) =>
    /intervention|cancelled|proceeded|decision/i.test(log.action),
  ).length;
  const intelligenceEvents = recentLogs.filter((log) =>
    /scam|pattern/i.test(log.action),
  ).length;
  const lastUpdated = auditQuery.dataUpdatedAt || statsQuery.dataUpdatedAt;
  const isLive = liveEnabled && !auditQuery.isError && !statsQuery.isError;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-rose-500" />
            <h2 className="font-bold text-slate-800">Live audit dashboard</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${isLive ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {isLive ? "Live" : "Paused"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Theo dõi audit, cảnh báo và HITL từ dữ liệu thật; tự làm mới mỗi 5 giây.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-slate-400 sm:flex">
            <Wifi className={`h-3.5 w-3.5 ${isLive ? "text-emerald-500" : "text-slate-400"}`} />
            {lastUpdated ? `Cập nhật ${new Date(lastUpdated).toLocaleTimeString("vi-VN")}` : "Đang kết nối..."}
          </span>
          <select value={action} onChange={(event) => setAction(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500">
            <option value="">Tất cả hành động</option>
            {actions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button onClick={() => setLiveEnabled((value) => !value)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50" title={liveEnabled ? "Tạm dừng live" : "Bật live polling"}>
            {liveEnabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">{liveEnabled ? "Tạm dừng" : "Tiếp tục"}</span>
          </button>
          <button onClick={() => void auditQuery.refetch()} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Làm mới">
            <RefreshCw className={`h-4 w-4 ${auditQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sự kiện / 5 phút", value: recentLogs.length, icon: Activity, tone: "rose" },
          { label: "Cảnh báo rủi ro", value: warningEvents, icon: ShieldAlert, tone: "amber" },
          { label: "HITL / quyết định", value: hitlEvents, icon: CheckCircle2, tone: "blue" },
          { label: "Scam intelligence", value: intelligenceEvents, icon: Ban, tone: "violet" },
        ].map((card) => {
          const Icon = card.icon;
          const toneClass = card.tone === "amber" ? "bg-amber-50 text-amber-600" : card.tone === "blue" ? "bg-blue-50 text-blue-600" : card.tone === "violet" ? "bg-violet-50 text-violet-600" : "bg-rose-50 text-rose-600";
          return (
            <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-4 w-4" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Live</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800">Trạng thái hệ thống</h3>
              <p className="mt-1 text-xs text-slate-400">Snapshot từ risk engine và dữ liệu kiểm duyệt</p>
            </div>
            <span className="rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">{statsQuery.isFetching ? "Đang đồng bộ" : "Đã đồng bộ"}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Giao dịch", statsQuery.data?.total_transactions ?? 0],
              ["Rủi ro cao", statsQuery.data?.high_risk_count ?? 0],
              ["Blacklist", statsQuery.data?.blacklist_size ?? 0],
              ["Scam patterns", statsQuery.data?.pattern_count ?? 0],
            ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-800">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Audit health</p>
          <p className="mt-2 text-2xl font-bold">{isLive ? "Đang theo dõi" : "Đang tạm dừng"}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">Luồng audit chỉ đọc dữ liệu đã mask; không hiển thị PIN hoặc số tài khoản đầy đủ.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> PDPA safe logging</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {auditQuery.isLoading && <p className="p-6 text-sm text-slate-500">Đang tải audit log...</p>}
        {auditQuery.isError && <p className="p-6 text-sm text-red-600">Không tải được audit log từ máy chủ.</p>}
        {!auditQuery.isLoading && !auditQuery.isError && logs.length === 0 && <p className="p-6 text-sm text-slate-500">Chưa có audit log phù hợp.</p>}
        {logs.map((log) => (
          <div key={log.id} className="border-b border-slate-50 p-4 last:border-0 hover:bg-slate-50">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50"><FileClock className="h-4 w-4 text-rose-500" /></div>
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-800">{log.action}</p>
                  <p className="mt-1 text-xs text-slate-400">{log.resource_type} {log.resource_id ? `• ${log.resource_id}` : ""}</p>
                </div>
              </div>
              <time className="shrink-0 text-xs text-slate-400">{new Date(log.created_at).toLocaleString("vi-VN")}</time>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <span>Actor: {log.actor_id ?? "system"}</span>
              <span>IP: {log.ip_address ?? "—"}</span>
            </div>
            {log.metadata_json && Object.keys(log.metadata_json).length > 0 && (
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">{JSON.stringify(log.metadata_json, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== USERS TAB =====
function UsersTab({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (value: string) => void }) {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await axiosInstance.get<AdminUser[]>("/v1/admin/users")).data,
  });
  const updateUser = useMutation({
    mutationFn: async ({ id, path, body }: { id: string; path: "role" | "status"; body: object }) =>
      axiosInstance.patch(`/v1/admin/users/${id}/${path}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const users = (usersQuery.data ?? []).filter((user) =>
    `${user.full_name} ${user.email}`.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm theo tên hoặc email..." className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
      </div>
      {usersQuery.isError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Không tải được danh sách người dùng.</p>}
      {updateUser.isError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Không thể cập nhật quyền hoặc trạng thái. Hãy kiểm tra lại quyền admin.</p>}
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white shadow-sm">
        {usersQuery.isLoading && <p className="p-4 text-sm text-slate-500">Đang tải người dùng...</p>}
        {users.map((user) => (
          <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">{user.full_name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.role === "admin" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{user.role}</span>
              <button disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, path: "role", body: { role: user.role === "admin" ? "user" : "admin" } })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{user.role === "admin" ? "Gỡ admin" : "Cấp admin"}</button>
              <button disabled={updateUser.isPending} onClick={() => updateUser.mutate({ id: user.id, path: "status", body: { is_active: !user.is_active } })} className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${user.is_active ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}>{user.is_active ? "Khóa" : "Mở khóa"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== OVERVIEW TAB =====
function OverviewTab({ transactionsQuery, onViewAll }: { transactionsQuery: AdminTransactionsQuery; onViewAll: () => void }) {
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await axiosInstance.get<{
      total_transactions: number;
      by_risk_level: Record<string, number>;
      high_risk_count: number;
      high_risk_cancelled: number;
      recommendation_compliance_rate: number | null;
      blacklist_size: number;
      pattern_count: number;
    }>("/v1/admin/stats")).data,
  });

  const liveStats = statsQuery.data;
  const total = liveStats?.total_transactions ?? 0;
  const safeCount = (liveStats?.by_risk_level.safe ?? 0) + (liveStats?.by_risk_level.low ?? 0);
  const safeRate = total ? Math.round((safeCount / total) * 1000) / 10 : 0;
  const liveCards = [
    { label: "Tổng giao dịch", value: total.toLocaleString("vi-VN"), change: "Database", up: true, icon: ArrowRightLeft },
    { label: "Cảnh báo rủi ro cao", value: (liveStats?.high_risk_count ?? 0).toLocaleString("vi-VN"), change: "Risk engine", up: false, icon: ShieldAlert },
    { label: "Đã hủy sau cảnh báo", value: (liveStats?.high_risk_cancelled ?? 0).toLocaleString("vi-VN"), change: "HITL", up: true, icon: CheckCircle2 },
    { label: "Tỷ lệ an toàn", value: `${safeRate}%`, change: "Risk assessment", up: true, icon: ShieldAlert },
  ];
  const liveRiskDistribution = [
    { label: "An toàn", value: total ? Math.round((safeCount / total) * 100) : 0, color: "bg-emerald-500" },
    { label: "Lưu ý", value: total ? Math.round(((liveStats?.by_risk_level.medium ?? 0) / total) * 100) : 0, color: "bg-amber-500" },
    { label: "Nguy hiểm", value: total ? Math.round(((liveStats?.by_risk_level.high ?? 0) / total) * 100) : 0, color: "bg-red-500" },
  ];
  const liveRecentTransactions = (transactionsQuery.data ?? []).slice(0, 3).map((transaction) => ({
    id: transaction.id,
    user: transaction.user_name,
    amount: transaction.amount,
    status: transaction.transaction_status === "completed" ? "success" : transaction.transaction_status === "cancelled" || transaction.transaction_status === "failed" ? "failed" : "pending",
    risk: transaction.risk_level === "high" ? "high" : transaction.risk_level === "medium" ? "medium" : "low",
    time: new Date(transaction.created_at).toLocaleString("vi-VN"),
  }));

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {liveCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                  <Icon className="w-5 h-5 text-rose-500" />
                </div>
                <span className={`flex items-center gap-1 text-xs font-medium ${
                  stat.up ? "text-emerald-500" : "text-red-500"
                }`}>
                  {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {stat.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Risk Distribution */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Phân bổ rủi ro giao dịch</h3>
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 relative">
            <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
              {liveRiskDistribution.reduce((acc, item, i) => {
                const prevTotal = liveRiskDistribution.slice(0, i).reduce((s, r) => s + r.value, 0);
                const dashArray = `${item.value} ${100 - item.value}`;
                const dashOffset = -prevTotal;
                acc.push(
                  <circle
                    key={item.label}
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className={item.color.replace("bg-", "text-")}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                  />
                );
                return acc;
              }, [] as JSX.Element[])}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-slate-800">100%</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {liveRiskDistribution.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm text-slate-600">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">Hoạt động gần đây</h3>
          <button onClick={onViewAll} className="text-sm text-rose-500 font-medium hover:underline">Xem tất cả</button>
        </div>
        <div className="space-y-3">
          {transactionsQuery.isError && <p className="text-sm text-red-600">Không tải được giao dịch từ máy chủ.</p>}
          {!transactionsQuery.isLoading && !transactionsQuery.isError && liveRecentTransactions.length === 0 && <p className="text-sm text-slate-500">Chưa có giao dịch trong database.</p>}
          {liveRecentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                tx.status === "success" ? "bg-emerald-50" :
                tx.status === "blocked" ? "bg-red-50" :
                tx.status === "pending" ? "bg-amber-50" : "bg-gray-50"
              }`}>
                {tx.status === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                 tx.status === "blocked" ? <Ban className="w-5 h-5 text-red-500" /> :
                 tx.status === "pending" ? <Clock className="w-5 h-5 text-amber-500" /> :
                 <AlertTriangle className="w-5 h-5 text-gray-500" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{tx.user}</p>
                <p className="text-xs text-slate-400">{tx.id} • {tx.time}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-800">{new Intl.NumberFormat("vi-VN").format(tx.amount)} đ</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tx.risk === "low" ? "bg-emerald-50 text-emerald-600" :
                  tx.risk === "medium" ? "bg-amber-50 text-amber-600" :
                  tx.risk === "high" ? "bg-orange-50 text-orange-600" :
                  "bg-red-50 text-red-600"
                }`}>
                  {tx.risk === "low" ? "An toàn" :
                   tx.risk === "medium" ? "Lưu ý" :
                   tx.risk === "high" ? "Rủi ro" : "Nguy hiểm"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== TRANSACTIONS TAB =====
function TransactionsTab({ transactionsQuery, searchQuery, setSearchQuery }: { transactionsQuery: AdminTransactionsQuery; searchQuery: string; setSearchQuery: (s: string) => void }) {
  const [filter, setFilter] = useState("all");
  const transactions = (transactionsQuery.data ?? []).map((transaction) => ({
    id: transaction.id,
    user: `${transaction.user_name} → ${transaction.payee_name}`,
    amount: transaction.amount,
    status: transaction.transaction_status === "completed" ? "success" : transaction.transaction_status === "cancelled" || transaction.transaction_status === "failed" ? "failed" : transaction.transaction_status === "awaiting_decision" && transaction.risk_level === "high" ? "blocked" : "pending",
    risk: transaction.risk_level === "high" ? "high" : transaction.risk_level === "medium" ? "medium" : "low",
    time: new Date(transaction.created_at).toLocaleString("vi-VN"),
  }));

  const filtered = transactions.filter((tx) => {
    if (filter !== "all" && tx.status !== filter) return false;
    if (searchQuery && !tx.user.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const transactionError = transactionsQuery.error;
  const transactionErrorMessage = axios.isAxiosError(transactionError)
    ? typeof transactionError.response?.data?.detail === "string"
      ? transactionError.response.data.detail
      : `Không tải được giao dịch (HTTP ${transactionError.response?.status ?? "không xác định"}).`
    : "Không thể kết nối tới máy chủ.";

  const handleExport = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["ID", "Người dùng / Người nhận", "Số tiền", "Trạng thái", "Rủi ro", "Thời gian"],
      ...filtered.map((tx) => [tx.id, tx.user, tx.amount, tx.status, tx.risk, tx.time]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-giao-dich-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm giao dịch..."
            className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
          <Filter className="w-4 h-4 text-slate-600" />
        </button>
        <button onClick={handleExport} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50" title="Xuất giao dịch đang hiển thị">
          <Download className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: "all", label: "Tất cả" },
          { key: "success", label: "Thành công" },
          { key: "blocked", label: "Đã chặn" },
          { key: "pending", label: "Đang xử lý" },
          { key: "failed", label: "Thất bại" },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === item.key ? "bg-rose-500 text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
        {transactionsQuery.isLoading && <p className="p-5 text-sm text-slate-500">Đang tải giao dịch...</p>}
        {transactionsQuery.isError && <p className="p-5 text-sm text-red-600">{transactionErrorMessage}</p>}
        {!transactionsQuery.isLoading && !transactionsQuery.isError && filtered.length === 0 && <p className="p-5 text-sm text-slate-500">Không có giao dịch phù hợp.</p>}
        {filtered.map((tx) => (
          <div key={tx.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  tx.status === "success" ? "bg-emerald-50" :
                  tx.status === "blocked" ? "bg-red-50" :
                  tx.status === "pending" ? "bg-amber-50" : "bg-gray-50"
                }`}>
                  {tx.status === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                   tx.status === "blocked" ? <Ban className="w-4 h-4 text-red-500" /> :
                   tx.status === "pending" ? <Clock className="w-4 h-4 text-amber-500" /> :
                   <AlertTriangle className="w-4 h-4 text-gray-500" />}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{tx.user}</p>
                  <p className="text-xs text-slate-400">{tx.id}</p>
                </div>
              </div>
              <button className="p-1 hover:bg-slate-100 rounded-full">
                <MoreVertical className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{new Intl.NumberFormat("vi-VN").format(tx.amount)} đ</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  tx.risk === "low" ? "bg-emerald-50 text-emerald-600" :
                  tx.risk === "medium" ? "bg-amber-50 text-amber-600" :
                  tx.risk === "high" ? "bg-orange-50 text-orange-600" :
                  "bg-red-50 text-red-600"
                }`}>
                  {tx.risk === "low" ? "An toàn" :
                   tx.risk === "medium" ? "Lưu ý" :
                   tx.risk === "high" ? "Rủi ro" : "Nguy hiểm"}
                </span>
              </div>
              <span className="text-xs text-slate-400">{tx.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== BLACKLIST TAB =====
function BlacklistTab({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (s: string) => void }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const blacklistQuery = useInfiniteQuery({
    queryKey: ["admin-blacklist"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => (
      await axiosInstance.get<BlacklistPage>("/v1/admin/blacklist", {
        params: { limit: 20, cursor: pageParam ?? undefined },
      })
    ).data,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const entries = (blacklistQuery.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => ({
    id: entry.id,
    type: entry.entity_type,
    value: entry.entity_value,
    reason: entry.source,
    addedAt: new Date(entry.created_at).toLocaleString("vi-VN"),
    reports: entry.evidence && typeof entry.evidence.reports === "number" ? entry.evidence.reports : 0,
  }));
  const filtered = entries.filter((entry) => {
    if (searchQuery && !entry.value.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm trong blacklist..."
            className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-rose-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-rose-500 text-white text-sm font-medium rounded-xl hover:bg-rose-600 transition-colors"
        >
          + Thêm mới
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
        {blacklistQuery.isLoading && <p className="p-5 text-sm text-slate-500">Đang tải blacklist mới nhất...</p>}
        {blacklistQuery.isError && <p className="p-5 text-sm text-red-600">Không tải được blacklist từ máy chủ.</p>}
        {!blacklistQuery.isLoading && !blacklistQuery.isError && filtered.length === 0 && <p className="p-5 text-sm text-slate-500">Không có bản ghi blacklist phù hợp.</p>}
        {filtered.map((entry) => (
          <div key={entry.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <Ban className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="max-w-[min(70vw,32rem)] break-all whitespace-normal font-semibold text-slate-800 text-sm">{entry.value}</p>
                  <p className="text-xs text-slate-400 capitalize">{entry.type}</p>
                </div>
              </div>
              <span className="text-xs text-red-500 font-medium">{entry.reports} báo cáo</span>
            </div>
            <p className="break-words whitespace-pre-wrap text-sm text-slate-600 mb-1">{entry.reason}</p>
            <p className="text-xs text-slate-400">Thêm vào: {entry.addedAt}</p>
          </div>
        ))}
      </div>
      {blacklistQuery.hasNextPage && !blacklistQuery.isError && (
        <button
          type="button"
          onClick={() => blacklistQuery.fetchNextPage()}
          disabled={blacklistQuery.isFetchingNextPage}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {blacklistQuery.isFetchingNextPage ? (
            <><RefreshCw className="h-4 w-4 animate-spin" />Đang tải thêm...</>
          ) : (
            "Tải thêm bản ghi"
          )}
        </button>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Thêm vào Blacklist</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Loại</label>
                <select className="w-full p-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:ring-2 focus:ring-rose-500 outline-none">
                  <option value="account">Tài khoản ngân hàng</option>
                  <option value="phone">Số điện thoại</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Giá trị</label>
                <input type="text" className="w-full p-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:ring-2 focus:ring-rose-500 outline-none" placeholder="Nhập giá trị..." />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Lý do</label>
                <textarea className="w-full p-2.5 bg-gray-50 rounded-xl border-0 text-sm focus:ring-2 focus:ring-rose-500 outline-none resize-none" rows={2} placeholder="Lý do thêm vào danh sách đen..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 bg-rose-500 text-white font-medium rounded-xl hover:bg-rose-600 transition-colors">
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== SETTINGS TAB =====
function SettingsTab() {
  const [settings, setSettings] = useState({
    autoBlock: true,
    aiIntervention: true,
    notifyAdmin: true,
    riskThreshold: 0.7,
    dailyLimit: 50000000,
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Cấu hình AI Anti-Scam</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Tự động chặn giao dịch</p>
              <p className="text-xs text-slate-400">Chặn ngay khi phát hiện rủi ro cao</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, autoBlock: !settings.autoBlock })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.autoBlock ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.autoBlock ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Can thiệp AI thông minh</p>
              <p className="text-xs text-slate-400">Hiển thị cảnh báo chi tiết cho người dùng</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, aiIntervention: !settings.aiIntervention })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.aiIntervention ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.aiIntervention ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Thông báo admin</p>
              <p className="text-xs text-slate-400">Gửi alert khi có giao dịch bị chặn</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, notifyAdmin: !settings.notifyAdmin })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                settings.notifyAdmin ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                settings.notifyAdmin ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Ngưỡng rủi ro</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Ngưỡng cảnh báo</span>
              <span className="font-bold text-rose-600">{(settings.riskThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.riskThreshold}
              onChange={(e) => setSettings({ ...settings, riskThreshold: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Giới hạn giao dịch/ngày</span>
              <span className="font-bold text-rose-600">{new Intl.NumberFormat("vi-VN").format(settings.dailyLimit)} đ</span>
            </div>
            <input
              type="range"
              min="1000000"
              max="500000000"
              step="1000000"
              value={settings.dailyLimit}
              onChange={(e) => setSettings({ ...settings, dailyLimit: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
