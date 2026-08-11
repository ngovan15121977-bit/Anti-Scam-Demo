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
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  Receipt,
  PieChart,
  BarChart3,
  Shield,
  Sparkles,
  Download,
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

const demoTransactions: Transaction[] = [
  { id: "TXN001", type: "transfer", recipient_name: "Nguyễn Văn A", recipient_account: "123456789", amount: 500000, status: "success", risk_level: "low", created_at: "2026-08-06T14:30:00", description: "Chuyển tiền ăn trưa" },
  { id: "TXN002", type: "transfer", recipient_name: "Lê Thị B", recipient_account: "987654321", amount: 2000000, status: "blocked", risk_level: "critical", created_at: "2026-08-06T10:15:00", description: "AI phát hiện tài khoản đen" },
  { id: "TXN003", type: "receive", recipient_name: "Trần Văn C", recipient_account: "456789123", amount: 1000000, status: "success", risk_level: "low", created_at: "2026-08-05T16:45:00", description: "Nhận tiền từ bạn" },
  { id: "TXN004", type: "payment", recipient_name: "Công ty Điện lực", recipient_account: "EVN001", amount: 350000, status: "success", risk_level: "low", created_at: "2026-08-05T08:00:00", description: "Thanh toán hóa đơn điện" },
  { id: "TXN005", type: "transfer", recipient_name: "Phạm Thị D", recipient_account: "789123456", amount: 5000000, status: "pending", risk_level: "medium", created_at: "2026-08-04T20:30:00", description: "Chuyển tiền mua hàng" },
  { id: "TXN006", type: "transfer", recipient_name: "Hoàng Văn E", recipient_account: "321654987", amount: 1500000, status: "failed", risk_level: "high", created_at: "2026-08-04T14:00:00", description: "Người dùng hủy sau cảnh báo AI" },
];

const statusConfig = {
  success: { label: "Thành công", icon: CheckCircle2, color: "text-emerald-500 bg-emerald-50 border-emerald-100" },
  pending: { label: "Đang xử lý", icon: Clock, color: "text-amber-500 bg-amber-50 border-amber-100" },
  failed: { label: "Thất bại", icon: XCircle, color: "text-red-500 bg-red-50 border-red-100" },
  blocked: { label: "Đã chặn", icon: ShieldAlert, color: "text-red-600 bg-red-100 border-red-200" },
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

  const formatMoney = (amount: number) => new Intl.NumberFormat("vi-VN").format(amount) + " đ";
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hôm nay, " + date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Hôm qua, " + date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const getTypeIcon = (type: string) => {
    switch (type) { case "transfer": return <ArrowUpRight className="w-4 h-4 text-rose-500" />; case "receive": return <ArrowDownLeft className="w-4 h-4 text-emerald-500" />; case "payment": return <ArrowRightLeft className="w-4 h-4 text-blue-500" />; default: return <ArrowRightLeft className="w-4 h-4" />; }
  };
  const getTypeLabel = (type: string) => { switch (type) { case "transfer": return "Chuyển tiền"; case "receive": return "Nhận tiền"; case "payment": return "Thanh toán"; default: return type; } };
  const totalIn = filteredTransactions.filter(t => t.type === "receive").reduce((sum, t) => sum + t.amount, 0);
  const totalOut = filteredTransactions.filter(t => t.type === "transfer").reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50 w-full relative overflow-hidden">
      {/* Decorative Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-gradient-to-br from-rose-200/30 to-pink-200/20 rounded-full blur-3xl translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-br from-blue-200/25 to-violet-200/20 rounded-full blur-3xl -translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] bg-gradient-to-br from-amber-200/20 to-orange-200/15 rounded-full blur-3xl translate-x-1/3" />
        <div className="absolute top-24 left-16 w-2 h-2 bg-rose-300 rounded-full opacity-40" />
        <div className="absolute bottom-40 right-24 w-3 h-3 bg-blue-300 rounded-full opacity-30" />
      </div>

      <div className="relative z-10">
        <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-6 lg:px-8 xl:px-12 py-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
            <h1 className="text-lg font-bold text-gray-800">Lịch sử giao dịch</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Tìm kiếm giao dịch..." className="w-full pl-11 pr-11 py-2.5 bg-gray-100 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none transition-shadow" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <button onClick={() => setShowFilters(!showFilters)} className={`absolute right-2.5 top-1.5 p-1.5 rounded-lg transition-colors ${showFilters ? "bg-rose-100 text-rose-600" : "hover:bg-gray-200 text-gray-400"}`}><Filter className="w-5 h-5" /></button>
          </div>
          {showFilters && (
            <div className="mt-4 space-y-4 animate-in slide-in-from-top-2">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Loại giao dịch</p>
                <div className="flex gap-2 flex-wrap">
                  {[{ key: "all", label: "Tất cả" }, { key: "transfer", label: "Chuyển tiền" }, { key: "receive", label: "Nhận tiền" }, { key: "payment", label: "Thanh toán" }].map((item) => (
                    <button key={item.key} onClick={() => setFilter(item.key as any)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${filter === item.key ? "bg-rose-500 text-white shadow-md shadow-rose-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{item.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Trạng thái</p>
                <div className="flex gap-2 flex-wrap">
                  {[{ key: "all", label: "Tất cả" }, { key: "success", label: "Thành công" }, { key: "pending", label: "Đang xử lý" }, { key: "failed", label: "Thất bại" }, { key: "blocked", label: "Đã chặn" }].map((item) => (
                    <button key={item.key} onClick={() => setStatusFilter(item.key as any)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${statusFilter === item.key ? "bg-rose-500 text-white shadow-md shadow-rose-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{item.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar */}
            <div className="hidden xl:block lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" />Thống kê nhanh
                </h3>
                <div className="space-y-4">
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <p className="text-[10px] text-rose-500 font-bold uppercase">Chi tiêu</p>
                    <p className="text-lg font-extrabold text-rose-600">{formatMoney(totalOut)}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <p className="text-[10px] text-emerald-500 font-bold uppercase">Thu nhập</p>
                    <p className="text-lg font-extrabold text-emerald-600">{formatMoney(totalIn)}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-blue-500 font-bold uppercase">Chênh lệch</p>
                    <p className={`text-lg font-extrabold ${totalIn - totalOut >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatMoney(totalIn - totalOut)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200 relative overflow-hidden">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-white/10 rounded-full" />
                <Shield className="w-5 h-5 text-white/40 mb-2" />
                <p className="text-xs font-bold mb-1">Bảo vệ 24/7</p>
                <p className="text-[10px] text-emerald-100">AI đã quét 100% giao dịch của bạn</p>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-7 xl:col-span-7 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2"><Receipt className="w-4 h-4 text-gray-400" /><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tổng giao dịch</p></div>
                  <p className="text-2xl font-extrabold text-gray-900">{filteredTransactions.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Đã nhận</p></div>
                  <p className="text-2xl font-extrabold text-emerald-600">{formatMoney(totalIn)}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-rose-500" /><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Đã chuyển</p></div>
                  <p className="text-2xl font-extrabold text-rose-600">{formatMoney(totalOut)}</p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2"><Wallet className="w-4 h-4 text-blue-500" /><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Chênh lệch</p></div>
                  <p className={`text-2xl font-extrabold ${totalIn - totalOut >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{formatMoney(totalIn - totalOut)}</p>
                </div>
              </div>

              {/* Transaction List */}
              <div className="space-y-4">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100"><Clock className="w-14 h-14 text-gray-200 mx-auto mb-4" /><p className="text-gray-500 font-medium">Không có giao dịch nào</p></div>
                ) : (
                  filteredTransactions.map((tx) => {
                    const status = statusConfig[tx.status];
                    const StatusIcon = status.icon;
                    const risk = riskConfig[tx.risk_level];
                    return (
                      <div key={tx.id} className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-gray-50 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <div className="relative">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tx.type === "transfer" ? "bg-rose-50" : tx.type === "receive" ? "bg-emerald-50" : "bg-blue-50"}`}>{getTypeIcon(tx.type)}</div>
                              <div><p className="font-bold text-gray-900 text-sm">{tx.recipient_name}</p><p className="text-xs text-gray-400">{getTypeLabel(tx.type)} • {tx.recipient_account}</p></div>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${status.color}`}><StatusIcon className="w-3.5 h-3.5" /><span className="text-xs font-bold">{status.label}</span></div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className={`text-xl font-extrabold ${tx.type === "receive" ? "text-emerald-600" : "text-gray-900"}`}>{tx.type === "receive" ? "+" : "-"}{formatMoney(tx.amount)}</p>
                              <p className="text-xs text-gray-400 mt-1">{tx.description}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-400 flex items-center gap-1 justify-end"><Calendar className="w-3 h-3" />{formatDate(tx.created_at)}</p>
                              {tx.risk_level !== "low" && <p className={`text-xs font-bold mt-1.5 ${risk.color}`}>{risk.label}</p>}
                            </div>
                          </div>
                          {tx.status === "blocked" && (
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl">
                              <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-500" /><p className="text-xs text-red-600 font-bold">AI Anti-Scam đã chặn giao dịch này</p></div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="hidden lg:block lg:col-span-3 space-y-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <PieChart className="w-3.5 h-3.5" />Phân tích tháng
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5"><span className="text-gray-500">Chuyển tiền</span><span className="font-bold text-gray-800">65%</span></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full w-[65%] bg-gradient-to-r from-rose-500 to-pink-500 rounded-full" /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5"><span className="text-gray-500">Thanh toán</span><span className="font-bold text-gray-800">25%</span></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full w-[25%] bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5"><span className="text-gray-500">Nhận tiền</span><span className="font-bold text-gray-800">10%</span></div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full w-[10%] bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" /></div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Lọc nhanh</h3>
                <div className="space-y-2">
                  {["Hôm nay", "Hôm qua", "Tuần này", "Tháng này"].map((label) => (
                    <button key={label} className="w-full text-left px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-rose-50 hover:text-rose-600 transition-colors font-medium">{label}</button>
                  ))}
                </div>
              </div>

              <button className="w-full flex items-center justify-center gap-2 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow text-sm font-bold text-gray-700">
                <Download className="w-4 h-4" />Xuất báo cáo
              </button>

              <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-200 relative overflow-hidden">
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-white/10 rounded-full" />
                <Sparkles className="w-5 h-5 text-white/40 mb-2" />
                <p className="text-xs font-bold mb-1">Giao dịch an toàn</p>
                <p className="text-[10px] text-amber-100">100% giao dịch tháng này đã được AI xác minh</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}