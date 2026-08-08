import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
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
} from "lucide-react";

// Demo data
const stats = [
  { label: "Tổng người dùng", value: "12,456", change: "+8.2%", up: true, icon: Users },
  { label: "Giao dịch hôm nay", value: "3,842", change: "+12.5%", up: true, icon: ArrowRightLeft },
  { label: "Giao dịch bị chặn", value: "127", change: "+23.1%", up: false, icon: ShieldAlert },
  { label: "Tỷ lệ an toàn", value: "99.2%", change: "+0.3%", up: true, icon: CheckCircle2 },
];

const recentTransactions = [
  { id: "TXN001", user: "Nguyễn Văn A", amount: 500000, status: "success", risk: "low", time: "2 phút trước" },
  { id: "TXN002", user: "Lê Thị B", amount: 2000000, status: "blocked", risk: "critical", time: "5 phút trước" },
  { id: "TXN003", user: "Trần Văn C", amount: 150000, status: "success", risk: "low", time: "10 phút trước" },
  { id: "TXN004", user: "Phạm Thị D", amount: 5000000, status: "pending", risk: "medium", time: "15 phút trước" },
  { id: "TXN005", user: "Hoàng Văn E", amount: 1000000, status: "failed", risk: "high", time: "20 phút trước" },
];

const blacklistEntries = [
  { id: "BL001", type: "account", value: "123456789", reason: "Nhiều báo cáo lừa đảo", addedAt: "2026-08-05", reports: 15 },
  { id: "BL002", type: "phone", value: "0909123456", reason: "Số điện thoại lừa đảo", addedAt: "2026-08-04", reports: 8 },
  { id: "BL003", type: "email", value: "scam@example.com", reason: "Email phishing", addedAt: "2026-08-03", reports: 23 },
];

const riskDistribution = [
  { label: "An toàn", value: 78, color: "bg-emerald-500" },
  { label: "Lưu ý", value: 15, color: "bg-amber-500" },
  { label: "Rủi ro", value: 5, color: "bg-orange-500" },
  { label: "Nguy hiểm", value: 2, color: "bg-red-500" },
];

type TabType = "overview" | "transactions" | "blacklist" | "settings";

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    { key: "overview" as TabType, label: "Tổng quan", icon: BarChart3 },
    { key: "transactions" as TabType, label: "Giao dịch", icon: ArrowRightLeft },
    { key: "blacklist" as TabType, label: "Blacklist", icon: Ban },
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
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "transactions" && <TransactionsTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
        {activeTab === "blacklist" && <BlacklistTab searchQuery={searchQuery} setSearchQuery={setSearchQuery} />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ===== OVERVIEW TAB =====
function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
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
              {riskDistribution.reduce((acc, item, i) => {
                const prevTotal = riskDistribution.slice(0, i).reduce((s, r) => s + r.value, 0);
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
            {riskDistribution.map((item) => (
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
          <button className="text-sm text-rose-500 font-medium hover:underline">Xem tất cả</button>
        </div>
        <div className="space-y-3">
          {recentTransactions.slice(0, 3).map((tx) => (
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
function TransactionsTab({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (s: string) => void }) {
  const [filter, setFilter] = useState("all");

  const filtered = recentTransactions.filter((tx) => {
    if (filter !== "all" && tx.status !== filter) return false;
    if (searchQuery && !tx.user.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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
        <button className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
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

  const filtered = blacklistEntries.filter((entry) => {
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
        {filtered.map((entry) => (
          <div key={entry.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <Ban className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{entry.value}</p>
                  <p className="text-xs text-slate-400 capitalize">{entry.type}</p>
                </div>
              </div>
              <span className="text-xs text-red-500 font-medium">{entry.reports} báo cáo</span>
            </div>
            <p className="text-sm text-slate-600 mb-1">{entry.reason}</p>
            <p className="text-xs text-slate-400">Thêm vào: {entry.addedAt}</p>
          </div>
        ))}
      </div>

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
