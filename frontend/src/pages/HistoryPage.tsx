import { useState } from "react";
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
  ChevronDown,
  Calendar,
} from "lucide-react";

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
}

// Demo data
const demoTransactions: Transaction[] = [
  {
    id: "TXN001",
    type: "transfer",
    recipient_name: "Nguyễn Văn A",
    recipient_account: "123456789",
    amount: 500000,
    status: "success",
    risk_level: "low",
    created_at: "2026-08-06T14:30:00",
    description: "Chuyển tiền ăn trưa",
  },
  {
    id: "TXN002",
    type: "transfer",
    recipient_name: "Lê Thị B",
    recipient_account: "987654321",
    amount: 2000000,
    status: "blocked",
    risk_level: "critical",
    created_at: "2026-08-06T10:15:00",
    description: "AI phát hiện tài khoản đen",
  },
  {
    id: "TXN003",
    type: "receive",
    recipient_name: "Trần Văn C",
    recipient_account: "456789123",
    amount: 1000000,
    status: "success",
    risk_level: "low",
    created_at: "2026-08-05T16:45:00",
    description: "Nhận tiền từ bạn",
  },
  {
    id: "TXN004",
    type: "payment",
    recipient_name: "Công ty Điện lực",
    recipient_account: "EVN001",
    amount: 350000,
    status: "success",
    risk_level: "low",
    created_at: "2026-08-05T08:00:00",
    description: "Thanh toán hóa đơn điện",
  },
  {
    id: "TXN005",
    type: "transfer",
    recipient_name: "Phạm Thị D",
    recipient_account: "789123456",
    amount: 5000000,
    status: "pending",
    risk_level: "medium",
    created_at: "2026-08-04T20:30:00",
    description: "Chuyển tiền mua hàng",
  },
  {
    id: "TXN006",
    type: "transfer",
    recipient_name: "Hoàng Văn E",
    recipient_account: "321654987",
    amount: 1500000,
    status: "failed",
    risk_level: "high",
    created_at: "2026-08-04T14:00:00",
    description: "Người dùng hủy sau cảnh báo AI",
  },
];

const statusConfig = {
  success: { label: "Thành công", icon: CheckCircle2, color: "text-emerald-500 bg-emerald-50" },
  pending: { label: "Đang xử lý", icon: Clock, color: "text-amber-500 bg-amber-50" },
  failed: { label: "Thất bại", icon: XCircle, color: "text-red-500 bg-red-50" },
  blocked: { label: "Đã chặn", icon: ShieldAlert, color: "text-red-600 bg-red-100" },
};

const riskConfig = {
  low: { label: "An toàn", color: "text-emerald-500" },
  medium: { label: "Lưu ý", color: "text-amber-500" },
  high: { label: "Rủi ro", color: "text-orange-500" },
  critical: { label: "Nguy hiểm", color: "text-red-500" },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "transfer" | "receive" | "payment">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "pending" | "failed" | "blocked">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filteredTransactions = demoTransactions.filter((tx) => {
    if (filter !== "all" && tx.type !== filter) return false;
    if (statusFilter !== "all" && tx.status !== statusFilter) return false;
    if (searchQuery && !tx.recipient_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hôm nay, " + date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Hôm qua, " + date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "transfer": return <ArrowUpRight className="w-4 h-4 text-rose-500" />;
      case "receive": return <ArrowDownLeft className="w-4 h-4 text-emerald-500" />;
      case "payment": return <ArrowRightLeft className="w-4 h-4 text-blue-500" />;
      default: return <ArrowRightLeft className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "transfer": return "Chuyển tiền";
      case "receive": return "Nhận tiền";
      case "payment": return "Thanh toán";
      default: return type;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Lịch sử giao dịch</h1>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm giao dịch..."
            className="w-full pl-10 pr-10 py-2 bg-gray-100 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`absolute right-2 top-1.5 p-1 rounded-lg transition-colors ${showFilters ? "bg-rose-100 text-rose-600" : "hover:bg-gray-200 text-gray-400"}`}
          >
            <Filter className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-3 space-y-3 animate-in slide-in-from-top-2">
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Loại giao dịch</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "all", label: "Tất cả" },
                  { key: "transfer", label: "Chuyển tiền" },
                  { key: "receive", label: "Nhận tiền" },
                  { key: "payment", label: "Thanh toán" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setFilter(item.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filter === item.key
                        ? "bg-rose-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Trạng thái</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: "all", label: "Tất cả" },
                  { key: "success", label: "Thành công" },
                  { key: "pending", label: "Đang xử lý" },
                  { key: "failed", label: "Thất bại" },
                  { key: "blocked", label: "Đã chặn" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setStatusFilter(item.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      statusFilter === item.key
                        ? "bg-rose-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="px-4 py-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500">Tổng giao dịch</p>
          <p className="text-lg font-bold text-gray-800">{filteredTransactions.length}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500">Đã chuyển</p>
          <p className="text-lg font-bold text-rose-600">
            {formatMoney(filteredTransactions.filter(t => t.type === "transfer").reduce((sum, t) => sum + t.amount, 0))}
          </p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500">Đã nhận</p>
          <p className="text-lg font-bold text-emerald-600">
            {formatMoney(filteredTransactions.filter(t => t.type === "receive").reduce((sum, t) => sum + t.amount, 0))}
          </p>
        </div>
      </div>

      {/* Transaction List */}
      <div className="px-4 pb-6 space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Không có giao dịch nào</p>
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const status = statusConfig[tx.status];
            const StatusIcon = status.icon;
            const risk = riskConfig[tx.risk_level];

            return (
              <div
                key={tx.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      tx.type === "transfer" ? "bg-rose-50" :
                      tx.type === "receive" ? "bg-emerald-50" : "bg-blue-50"
                    }`}>
                      {getTypeIcon(tx.type)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{tx.recipient_name}</p>
                      <p className="text-xs text-gray-400">{getTypeLabel(tx.type)} • {tx.recipient_account}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${status.color}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{status.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-lg font-bold ${
                      tx.type === "receive" ? "text-emerald-600" : "text-gray-800"
                    }`}>
                      {tx.type === "receive" ? "+" : "-"}{formatMoney(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{tx.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(tx.created_at)}
                    </p>
                    {tx.risk_level !== "low" && (
                      <p className={`text-xs font-medium mt-1 ${risk.color}`}>
                        {risk.label}
                      </p>
                    )}
                  </div>
                </div>

                {/* AI Warning Banner */}
                {tx.status === "blocked" && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                      <p className="text-xs text-red-600 font-medium">AI Anti-Scam đã chặn giao dịch này</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}