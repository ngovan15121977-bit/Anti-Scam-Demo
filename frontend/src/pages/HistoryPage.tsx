import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { transactionsApi, type Transaction as ApiTransaction } from "@/api/transactions";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Filter,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  Download,
  Loader2,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

interface Transaction {
  id: string;
  type: "transfer" | "receive" | "payment";
  recipient_name: string;
  recipient_account: string;
  amount: number;
  status: "success" | "pending" | "failed" | "blocked";
  risk_level: "low" | "medium" | "high" | "critical";
  created_at: string;
  description: string;
  reason: string;
  bank_code?: string;
  counterparty_account?: string;
}

const APP_TIME_ZONE = "Asia/Ho_Chi_Minh";
const appDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const getAppDateKey = (value: Date | string) =>
  appDateFormatter.format(new Date(value));
const shiftDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const statusConfig = {
  success: {
    label: "Thành công",
    icon: CheckCircle2,
    color: "text-emerald-600 bg-emerald-50 border-emerald-100",
  },
  pending: {
    label: "Đang xử lý",
    icon: Clock,
    color: "text-amber-600 bg-amber-50 border-amber-100",
  },
  failed: {
    label: "Thất bại",
    icon: XCircle,
    color: "text-red-600 bg-red-50 border-red-100",
  },
  blocked: {
    label: "Đã chặn",
    icon: ShieldAlert,
    color: "text-red-700 bg-red-100 border-red-200",
  },
};

const riskConfig = {
  low: { label: "An toàn", color: "text-emerald-500" },
  medium: { label: "Lưu ý", color: "text-amber-500" },
  high: { label: "Rủi ro", color: "text-orange-500" },
  critical: { label: "Nguy hiểm", color: "text-red-500" },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [filter, setFilter] = useState<"all" | "transfer" | "receive" | "payment">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "pending" | "failed" | "blocked"
  >("all");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "today" | "yesterday" | "week" | "month"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [chartRange, setChartRange] = useState<"7" | "30">("7");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const hasGlobalFilter =
    filter !== "all" ||
    statusFilter !== "all" ||
    quickFilter !== "all" ||
    searchQuery.trim().length > 0;

  const historyQuery = useInfiniteQuery({
    queryKey: [
      "transaction-history",
      showAll,
      filter,
      statusFilter,
      quickFilter,
      searchQuery.trim(),
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      transactionsApi.getHistory({
        // A search/filter must scan every cursor page so old transactions are
        // searchable. The unfiltered dashboard view intentionally starts with 3.
        limit: showAll || hasGlobalFilter ? 20 : 3,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const historySummaryQuery = useQuery({
    queryKey: ["transaction-history-summary"],
    queryFn: () => transactionsApi.getHistorySummary(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (
      !hasGlobalFilter ||
      !historyQuery.hasNextPage ||
      historyQuery.isFetchingNextPage ||
      historyQuery.isError
    )
      return;
    void historyQuery.fetchNextPage();
  }, [
    hasGlobalFilter,
    historyQuery.hasNextPage,
    historyQuery.isFetchingNextPage,
    historyQuery.isError,
    historyQuery.fetchNextPage,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter, quickFilter, searchQuery, showAll]);

  const historyError = historyQuery.error;
  const historyErrorMessage = axios.isAxiosError(historyError)
    ? historyError.response?.status === 401
      ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
      : historyError.response?.status === 403
        ? "Tài khoản không có quyền xem lịch sử giao dịch."
        : typeof historyError.response?.data?.detail === "string"
          ? historyError.response.data.detail
          : `Không tải được lịch sử giao dịch (HTTP ${historyError.response?.status ?? "không xác định"}).`
    : "Không thể kết nối tới máy chủ.";

  const apiTransactions =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const transactions: Transaction[] = apiTransactions.map(
    (transaction: ApiTransaction) => ({
      id: transaction.id,
      type: transaction.direction === "incoming" ? "receive" : "transfer",
      recipient_name: transaction.counterparty_name,
      recipient_account: `${transaction.counterparty_account}${
        transaction.bank_code ? ` • ${transaction.bank_code}` : ""
      }`,
      amount: transaction.amount,
      status:
        transaction.transaction_status === "completed"
          ? "success"
          : transaction.transaction_status === "awaiting_decision" ||
              transaction.transaction_status === "processing" ||
              transaction.transaction_status === "risk_checking"
            ? "pending"
            : transaction.transaction_status === "cancelled" ||
                transaction.transaction_status === "failed"
              ? "failed"
              : "pending",
      risk_level:
        transaction.risk_level === "safe" ||
        transaction.risk_level === "low" ||
        !transaction.risk_level
          ? "low"
          : transaction.risk_level === "medium"
            ? "medium"
            : transaction.risk_level === "high"
              ? "high"
              : "critical",
      created_at: transaction.created_at,
      reason:
        transaction.risk_reason ||
        transaction.note ||
        "Giao dịch được ghi nhận trong lịch sử tài khoản.",
      description:
        transaction.direction === "incoming"
          ? transaction.transaction_status === "completed"
            ? "Đã nhận tiền qua Timi Bank"
            : "Giao dịch nhận tiền Timi Bank"
          : transaction.transaction_status === "completed"
            ? "Giao dịch đã hoàn tất"
            : "Giao dịch chuyển khoản",
      bank_code: transaction.bank_code,
      counterparty_account: transaction.counterparty_account,
    }),
  );

  const filteredTransactions = transactions.filter((tx) => {
    if (filter !== "all" && tx.type !== filter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      if (
        !tx.recipient_name.toLowerCase().includes(query) &&
        !tx.recipient_account.toLowerCase().includes(query) &&
        !tx.id.toLowerCase().includes(query)
      )
        return false;
    }
    if (quickFilter !== "all") {
      const transactionDateKey = getAppDateKey(tx.created_at);
      const todayKey = getAppDateKey(new Date());
      const yesterdayKey = shiftDateKey(todayKey, -1);
      const todayDate = new Date(`${todayKey}T00:00:00Z`);
      const dayOfWeek = todayDate.getUTCDay();
      const weekStartKey = shiftDateKey(
        todayKey,
        -(dayOfWeek === 0 ? 6 : dayOfWeek - 1),
      );
      const monthStartKey = `${todayKey.slice(0, 7)}-01`;
      if (quickFilter === "today" && transactionDateKey !== todayKey) return false;
      if (quickFilter === "yesterday" && transactionDateKey !== yesterdayKey)
        return false;
      if (
        quickFilter === "week" &&
        (transactionDateKey < weekStartKey || transactionDateKey > todayKey)
      )
        return false;
      if (
        quickFilter === "month" &&
        (transactionDateKey < monthStartKey || transactionDateKey > todayKey)
      )
        return false;
    }
    return true;
  });

  // Client-side pagination for the table view
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = filteredTransactions.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const handleExport = () => {
    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      [
        "ID",
        "Loại",
        "Người nhận",
        "Tài khoản",
        "Số tiền",
        "Trạng thái",
        "Rủi ro",
        "Thời gian",
      ],
      ...filteredTransactions.map((tx) => [
        tx.id,
        tx.type,
        tx.recipient_name,
        tx.recipient_account,
        tx.amount,
        tx.status,
        tx.risk_level,
        tx.created_at,
      ]),
    ];
    const csv =
      "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `lich-su-giao-dich-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatMoney = (amount: number) =>
    new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const todayKey = getAppDateKey(new Date());
    const dateKey = getAppDateKey(date);
    if (dateKey === todayKey)
      return (
        "Hôm nay, " +
        date.toLocaleTimeString("vi-VN", {
          timeZone: APP_TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    if (dateKey === shiftDateKey(todayKey, -1))
      return (
        "Hôm qua, " +
        date.toLocaleTimeString("vi-VN", {
          timeZone: APP_TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    return date.toLocaleDateString("vi-VN", {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("vi-VN", {
      timeZone: APP_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "transfer":
        return "Chuyển khoản";
      case "receive":
        return "Nhận tiền";
      case "payment":
        return "Thanh toán";
      default:
        return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "transfer":
        return <ArrowUpRight className="w-5 h-5 text-rose-500" />;
      case "receive":
        return <ArrowDownLeft className="w-5 h-5 text-emerald-500" />;
      case "payment":
        return <ArrowRightLeft className="w-5 h-5 text-blue-500" />;
      default:
        return <ArrowRightLeft className="w-5 h-5" />;
    }
  };

  const totalIn = filteredTransactions
    .filter((t) => t.type === "receive")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalOut = filteredTransactions
    .filter((t) => t.type === "transfer")
    .reduce((sum, t) => sum + t.amount, 0);
  const balance = user?.balance ?? 0;

  // Simple chart data from transactions (last N days)
  const chartData = useMemo(() => {
    const days = chartRange === "7" ? 7 : 30;
    const todayKey = getAppDateKey(new Date());
    const points: { key: string; label: string; in: number; out: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = shiftDateKey(todayKey, -i);
      const [, m, d] = key.split("-");
      points.push({ key, label: `${d}/${m}`, in: 0, out: 0 });
    }
    transactions.forEach((tx) => {
      const key = getAppDateKey(tx.created_at);
      const point = points.find((p) => p.key === key);
      if (!point) return;
      if (tx.type === "receive") point.in += tx.amount;
      else point.out += tx.amount;
    });
    return points;
  }, [transactions, chartRange]);

  const maxChartValue = Math.max(
    1,
    ...chartData.map((p) => Math.max(p.in, p.out)),
  );

  // Mask account for display
  const maskAccount = (account?: string) => {
    if (!account) return "•••• ••••";
    const digits = account.replace(/\D/g, "");
    if (digits.length < 8) return account;
    return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-x-hidden">
      {/* Soft background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto">
        {/* ===== HEADER ===== */}
        <header className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-white/70 rounded-full transition-colors"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Transactions
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 bg-white rounded-full px-5 py-3 shadow-sm border border-violet-100 w-full sm:w-72">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Tìm kiếm giao dịch..."
                className="bg-transparent text-base text-slate-700 outline-none w-full placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-3 bg-white rounded-full shadow-sm border border-violet-100 hover:bg-violet-50 transition-colors ${
                showFilters ? "ring-2 ring-violet-300" : ""
              }`}
              title="Bộ lọc"
            >
              <Filter className="w-5 h-5 text-slate-600" />
            </button>
            <button className="p-3 bg-white rounded-full shadow-sm border border-violet-100 hover:bg-violet-50 transition-colors">
              <Settings className="w-5 h-5 text-slate-600" />
            </button>
            <button className="relative p-3 bg-white rounded-full shadow-sm border border-violet-100 hover:bg-violet-50 transition-colors">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-violet-500 rounded-full" />
            </button>
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-semibold text-base shadow-md">
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
          </div>
        </header>

        {/* Expandable filters */}
        {showFilters && (
          <div className="px-4 sm:px-6 lg:px-8 mb-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80 space-y-5">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Loại giao dịch
                </p>
                <div className="flex gap-2.5 flex-wrap">
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "transfer", label: "Chuyển tiền" },
                      { key: "receive", label: "Nhận tiền" },
                      { key: "payment", label: "Thanh toán" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setFilter(item.key)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        filter === item.key
                          ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Trạng thái
                </p>
                <div className="flex gap-2.5 flex-wrap">
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "success", label: "Thành công" },
                      { key: "pending", label: "Đang xử lý" },
                      { key: "failed", label: "Thất bại" },
                      { key: "blocked", label: "Đã chặn" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setStatusFilter(item.key)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        statusFilter === item.key
                          ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Thời gian
                </p>
                <div className="flex gap-2.5 flex-wrap">
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "today", label: "Hôm nay" },
                      { key: "yesterday", label: "Hôm qua" },
                      { key: "week", label: "Tuần này" },
                      { key: "month", label: "Tháng này" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setQuickFilter(item.key)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        quickFilter === item.key
                          ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MAIN CONTENT ===== */}
        <div className="px-4 sm:px-6 lg:px-8 pb-10 space-y-6">
          {/* Top section: Cards + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* My Cards */}
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-800">Thẻ của tôi</h2>
                <button className="text-sm font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1">
                  + Thêm thẻ
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Card 1 – gradient violet */}
                <div className="relative rounded-2xl p-6 text-white overflow-hidden shadow-lg bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 min-h-[180px]">
                  <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3" />
                  <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3" />
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-white/70 font-medium">
                          Số dư
                        </p>
                        <p className="text-2xl font-bold mt-1 tabular-nums tracking-tight">
                          {formatMoney(balance)}
                        </p>
                      </div>
                      <CreditCard className="w-7 h-7 text-white/60" />
                    </div>
                    <div className="mt-5">
                      <div className="flex justify-between text-[11px] text-white/60 mb-1">
                        <span>CHỦ THẺ</span>
                        <span>HẾT HẠN</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="truncate max-w-[120px]">
                          {user?.full_name || "Timi User"}
                        </span>
                        <span>12/28</span>
                      </div>
                      <p className="mt-2.5 font-mono text-base tracking-wider text-white/90">
                        {maskAccount(user?.phone)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card 2 – soft / secondary */}
                <div className="relative rounded-2xl p-6 overflow-hidden shadow-sm border border-violet-100 bg-white min-h-[180px]">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-slate-400 font-medium">
                          Số dư
                        </p>
                        <p className="text-2xl font-bold mt-1 text-slate-900 tabular-nums tracking-tight">
                          {formatMoney(balance)}
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-slate-500" />
                      </div>
                    </div>
                    <div className="mt-5">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>CHỦ THẺ</span>
                        <span>HẾT HẠN</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-slate-700">
                        <span className="truncate max-w-[120px]">
                          {user?.full_name || "Timi User"}
                        </span>
                        <span>12/28</span>
                      </div>
                      <p className="mt-2.5 font-mono text-base tracking-wider text-slate-600">
                        {maskAccount(user?.phone)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Balance fluctuation chart */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-violet-100/80 h-full">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-bold text-slate-800">
                    Biến động số dư
                  </h2>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        Tiền vào
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        Tiền ra
                      </span>
                    </div>
                    <select
                      value={chartRange}
                      onChange={(e) =>
                        setChartRange(e.target.value as "7" | "30")
                      }
                      className="text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-violet-300"
                    >
                      <option value="7">7 ngày qua</option>
                      <option value="30">30 ngày qua</option>
                    </select>
                  </div>
                </div>

                {/* Simple SVG line chart */}
                <div className="relative h-52 w-full">
                  <svg
                    viewBox="0 0 600 160"
                    className="w-full h-full"
                    preserveAspectRatio="none"
                  >
                    {/* Grid lines */}
                    {[0, 40, 80, 120, 160].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="600"
                        y2={y}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray={y === 80 ? "0" : "4 4"}
                      />
                    ))}
                    {/* In line (green) */}
                    {chartData.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={chartData
                          .map((p, i) => {
                            const x =
                              (i / Math.max(1, chartData.length - 1)) * 580 + 10;
                            const y = 150 - (p.in / maxChartValue) * 130;
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />
                    )}
                    {/* Out line (red) */}
                    {chartData.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={chartData
                          .map((p, i) => {
                            const x =
                              (i / Math.max(1, chartData.length - 1)) * 580 + 10;
                            const y = 150 - (p.out / maxChartValue) * 130;
                            return `${x},${y}`;
                          })
                          .join(" ")}
                      />
                    )}
                    {/* Dots */}
                    {chartData.map((p, i) => {
                      const x =
                        (i / Math.max(1, chartData.length - 1)) * 580 + 10;
                      const yIn = 150 - (p.in / maxChartValue) * 130;
                      const yOut = 150 - (p.out / maxChartValue) * 130;
                      return (
                        <g key={p.key}>
                          <circle cx={x} cy={yIn} r="3.5" fill="#10b981" />
                          <circle cx={x} cy={yOut} r="3.5" fill="#f43f5e" />
                        </g>
                      );
                    })}
                  </svg>
                  {/* X labels */}
                  <div className="flex justify-between px-1 mt-2">
                    {chartData
                      .filter((_, i) =>
                        chartRange === "7"
                          ? true
                          : i % 5 === 0 || i === chartData.length - 1,
                      )
                      .map((p) => (
                        <span
                          key={p.key}
                          className="text-xs text-slate-400 font-medium"
                        >
                          {p.label}
                        </span>
                      ))}
                  </div>
                </div>

                {/* Summary under chart */}
                <div className="mt-4 flex gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-slate-500">Tổng vào:</span>
                    <span className="font-bold text-emerald-600">
                      {formatMoney(totalIn)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    <span className="text-slate-500">Tổng ra:</span>
                    <span className="font-bold text-rose-600">
                      {formatMoney(totalOut)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Recent Transactions Table ===== */}
          <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
            <div className="px-6 sm:px-7 pt-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base font-bold text-slate-800">
                Giao dịch gần đây
              </h2>
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1.5">
                {(
                  [
                    { key: "all", label: "Tất cả giao dịch" },
                    { key: "receive", label: "Tiền vào" },
                    { key: "transfer", label: "Tiền ra" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      filter === tab.key
                        ? "bg-white text-violet-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {historyQuery.isLoading ? (
                <div className="flex min-h-[240px] items-center justify-center">
                  <div className="flex flex-col items-center text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500 mb-3" />
                    <p className="text-sm font-bold text-slate-800">
                      Đang tải lịch sử giao dịch
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Đang đồng bộ dữ liệu, vui lòng chờ...
                    </p>
                  </div>
                </div>
              ) : historyQuery.isError ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <div className="text-center">
                    <XCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
                    <p className="text-sm font-medium text-red-700">
                      {historyErrorMessage}
                    </p>
                  </div>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-14">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium text-sm">
                    Không có giao dịch nào
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 sm:px-7 py-4 font-semibold">Mô tả</th>
                      <th className="px-4 py-4 font-semibold hidden md:table-cell">
                        Mã giao dịch
                      </th>
                      <th className="px-4 py-4 font-semibold hidden sm:table-cell">
                        Loại giao dịch
                      </th>
                      <th className="px-4 py-4 font-semibold hidden lg:table-cell">
                        Thẻ/Tài khoản
                      </th>
                      <th className="px-4 py-4 font-semibold">Ngày</th>
                      <th className="px-4 py-4 font-semibold text-right">
                        Số tiền
                      </th>
                      <th className="px-6 sm:px-7 py-4 font-semibold text-right">
                        Liên kết
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTransactions.map((tx) => {
                      const isIn = tx.type === "receive";
                      return (
                        <tr
                          key={tx.id}
                          className="border-b border-slate-50 hover:bg-violet-50/40 transition-colors"
                        >
                          <td className="px-6 sm:px-7 py-4">
                            <div className="flex items-center gap-3.5">
                              <div
                                className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                                  isIn
                                    ? "bg-emerald-50"
                                    : tx.type === "payment"
                                      ? "bg-blue-50"
                                      : "bg-rose-50"
                                }`}
                              >
                                {getTypeIcon(tx.type)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-base font-semibold text-slate-800 truncate max-w-[200px]">
                                  {tx.recipient_name || tx.description}
                                </p>
                                <p className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">
                                  {tx.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden md:table-cell">
                            <span className="text-sm font-mono text-slate-500">
                              #{tx.id.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-4 hidden sm:table-cell">
                            <span className="text-sm font-medium text-slate-600">
                              {getTypeLabel(tx.type)}
                            </span>
                          </td>
                          <td className="px-4 py-4 hidden lg:table-cell">
                            <span className="text-sm font-mono text-slate-500">
                              {maskAccount(tx.counterparty_account)}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-sm text-slate-500 whitespace-nowrap">
                              {formatShortDate(tx.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={`text-base font-bold tabular-nums whitespace-nowrap ${
                                isIn ? "text-emerald-600" : "text-slate-800"
                              }`}
                            >
                              {isIn ? "+" : "-"}
                              {formatMoney(tx.amount)}
                            </span>
                          </td>
                          <td className="px-6 sm:px-7 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                // Single-row export / detail – reuse export logic for one row
                                const escapeCsv = (value: string | number) =>
                                  `"${String(value).replace(/"/g, '""')}"`;
                                const rows = [
                                  [
                                    "ID",
                                    "Loại",
                                    "Người nhận",
                                    "Tài khoản",
                                    "Số tiền",
                                    "Trạng thái",
                                    "Thời gian",
                                  ],
                                  [
                                    tx.id,
                                    tx.type,
                                    tx.recipient_name,
                                    tx.recipient_account,
                                    tx.amount,
                                    tx.status,
                                    tx.created_at,
                                  ],
                                ];
                                const csv =
                                  "\uFEFF" +
                                  rows
                                    .map((row) => row.map(escapeCsv).join(","))
                                    .join("\n");
                                const url = URL.createObjectURL(
                                  new Blob([csv], {
                                    type: "text/csv;charset=utf-8",
                                  }),
                                );
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = `giao-dich-${tx.id.slice(0, 8)}.csv`;
                                link.click();
                                URL.revokeObjectURL(url);
                              }}
                              className="text-sm font-semibold text-violet-600 hover:text-violet-700 hover:underline"
                            >
                              Tải xuống
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination + load more */}
            {!historyQuery.isLoading &&
              !historyQuery.isError &&
              filteredTransactions.length > 0 && (
                <div className="px-6 sm:px-7 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-50">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    {!showAll && !hasGlobalFilter && (
                      <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="font-semibold text-violet-600 hover:text-violet-700"
                      >
                        Xem tất cả lịch sử
                      </button>
                    )}
                    {showAll &&
                      !hasGlobalFilter &&
                      historyQuery.hasNextPage && (
                        <button
                          type="button"
                          onClick={() => historyQuery.fetchNextPage()}
                          disabled={historyQuery.isFetchingNextPage}
                          className="font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {historyQuery.isFetchingNextPage ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Đang tải thêm...
                            </>
                          ) : (
                            "Tải thêm từ server"
                          )}
                        </button>
                      )}
                    {hasGlobalFilter && historyQuery.isFetchingNextPage && (
                      <span className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang tìm trong toàn bộ lịch sử...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      // simple window around current page
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        const start = Math.max(
                          1,
                          Math.min(page - 2, totalPages - 4),
                        );
                        pageNum = start + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setPage(pageNum)}
                          className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                            page === pageNum
                              ? "bg-violet-600 text-white shadow-sm"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-600 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Xuất CSV
                  </button>
                </div>
              )}
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>© 2024 Timi. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <button className="hover:text-slate-600 transition-colors">
              Privacy Policy
            </button>
            <button className="hover:text-slate-600 transition-colors">
              Terms of Service
            </button>
            <button className="hover:text-slate-600 transition-colors">
              Help Center
            </button>
          </div>
        </footer>
      </div>

      {/* Decorative wave — fixed full-width at bottom of viewport */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-48 sm:h-56 md:h-72 overflow-hidden opacity-30 select-none"
        aria-hidden="true"
      >
        <img
          src="/wave-footer.png"
          alt=""
          className="w-full h-full object-cover object-bottom"
        />
      </div>
    </div>
  );
}
