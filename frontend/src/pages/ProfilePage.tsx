import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Shield,
  Lock,
  Bell,
  HelpCircle,
  ChevronRight,
  LogOut,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [notifications, setNotifications] = useState({
    transaction: true,
    security: true,
    promotion: false,
  });
  const [transactionPin, setTransactionPin] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const overviewQuery = useQuery({
    queryKey: ["account-overview"],
    queryFn: authApi.overview,
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const avatar = event.target.files?.[0];
    event.target.value = "";
    if (!avatar) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatar.type) || avatar.size > 5 * 1024 * 1024) {
      setAvatarError("Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.");
      return;
    }
    setAvatarError("");
    setAvatarFailed(false);
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authApi.uploadAvatar(avatar);
      updateUser(updatedUser);
    } catch {
      setAvatarError("Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const menuItems = [
    {
      icon: Shield,
      label: "Bảo mật tài khoản",
      desc: "Đổi mật khẩu, xác thực 2 lớp",
      action: () => setShowPasswordModal(true),
    },
    {
      icon: Bell,
      label: "Thông báo",
      desc: "Quản lý cài đặt thông báo",
      action: () => navigate("/notifications"),
    },
    {
      icon: Lock,
      label: "Mã PIN giao dịch",
      desc: "Tạo hoặc cập nhật PIN khi chuyển tiền",
      action: () => setShowPinModal(true),
    },
    {
      icon: HelpCircle,
      label: "Trợ giúp",
      desc: "Câu hỏi thường gặp, liên hệ",
      action: () => navigate("/help"),
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      {/* Header — Full Width */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Tài khoản</h1>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Hero Profile Card — Full Width Gradient */}
        <div className="w-full bg-gradient-to-br from-rose-500 via-rose-600 to-pink-700 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-rose-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white/20 backdrop-blur rounded-full flex items-center justify-center border-2 border-white/30 overflow-hidden">
                {user?.avatar_url && !avatarFailed ? (
                  <img src={user.avatar_url} onError={() => setAvatarFailed(true)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarChange(event)} className="hidden" />
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar} aria-label="Đổi ảnh đại diện" className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60">
                <Camera className="w-4 h-4 text-rose-600" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold truncate">
                {user?.full_name || "Người dùng"}
              </h2>
              <p className="text-rose-100 text-sm mt-1 truncate">
                {user?.email || "email@example.com"}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="px-3 py-1 bg-white/20 backdrop-blur rounded-full text-xs font-semibold">
                  {user?.role === "admin" ? "Admin" : "Thành viên"}
                </span>
                {user?.is_active && (
                  <span className="flex items-center gap-1 px-3 py-1 bg-emerald-500/30 backdrop-blur rounded-full text-xs font-semibold text-emerald-100">
                    <CheckCircle2 className="w-3 h-3" />
                    Đã xác minh
                  </span>
                )}
              </div>
            </div>
          </div>
          {avatarError && <p className="mt-3 text-sm text-rose-100">{avatarError}</p>}

          {/* Stats Grid inside Hero */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold">
                {new Intl.NumberFormat("vi-VN").format(overview?.balance ?? user?.balance ?? 0)}
              </p>
              <p className="text-xs text-rose-100 mt-1">Số dư (VND)</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold">{overview?.transactions_today ?? "—"}</p>
              <p className="text-xs text-rose-100 mt-1">Giao dịch hôm nay</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold">{overview?.transactions_this_month ?? "—"}</p>
              <p className="text-xs text-rose-100 mt-1">Giao dịch tháng</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold">{overview?.security_grade ?? "—"}</p>
              <p className="text-xs text-rose-100 mt-1">Điểm bảo mật {overview ? `${overview.security_score}/100` : ""}</p>
            </div>
          </div>
        </div>

        <section className="w-full overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100 bg-emerald-50 px-5 py-4">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white"><Shield className="h-5 w-5" /></div><div><h3 className="font-bold text-slate-900">Điểm bảo mật</h3><p className="text-xs text-slate-500">Các lớp bảo vệ đã có và còn thiếu.</p></div></div>
            <p className="text-right text-2xl font-black text-emerald-600">{overview ? `${overview.security_grade} · ${overview.security_score}/100` : "Đang tải"}</p>
          </div>
          <div className="p-5"><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${overview?.security_score ?? 0}%` }} /></div><div className="mt-5 grid gap-3 md:grid-cols-3">{overview?.security_checks.map((check) => <div key={check.label} className={`rounded-xl border p-4 ${check.completed ? "border-emerald-100 bg-emerald-50/50" : "border-amber-100 bg-amber-50/50"}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-slate-800">{check.label}</p><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${check.completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{check.completed ? `+${check.score}` : `Còn +${check.score}`}</span></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{check.completed ? "Đã kích hoạt" : check.detail}</p></div>)}</div>{overview && !overview.transaction_pin_configured && <button onClick={() => setShowPinModal(true)} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Tạo PIN giao dịch (+35 điểm)</button>}</div>
        </section>

        {/* Personal Info — Full Width Card */}
        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Thông tin cá nhân
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <div className="w-11 h-11 bg-rose-50 rounded-xl flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">Họ và tên</p>
                <p className="font-semibold text-gray-900 truncate">
                  {user?.full_name || "Chưa cập nhật"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-semibold text-gray-900 truncate">
                  {user?.email || "Chưa cập nhật"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500">Số điện thoại</p>
                <p className="font-semibold text-gray-900 truncate">
                  {user?.phone || "Chưa cập nhật"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Menu — Full Width */}
        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Cài đặt
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex items-center gap-4 px-5 py-4 w-full hover:bg-gray-50/80 transition-colors group"
              >
                <div className="w-11 h-11 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-gray-200 transition-colors shrink-0">
                  <item.icon className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Notification Toggles — Full Width */}
        <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Thông báo
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              {
                key: "transaction" as const,
                label: "Giao dịch",
                desc: "Nhận thông báo khi có giao dịch mới",
              },
              {
                key: "security" as const,
                label: "Bảo mật",
                desc: "Cảnh báo khi phát hiện đăng nhập lạ",
              },
              {
                key: "promotion" as const,
                label: "Khuyến mãi",
                desc: "Thông báo ưu đãi và khuyến mãi",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
              >
                <div className="min-w-0 pr-4">
                  <p className="font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <button
                  onClick={() =>
                    setNotifications({
                      ...notifications,
                      [item.key]: !notifications[item.key],
                    })
                  }
                  className={`shrink-0 w-12 h-7 rounded-full transition-colors relative ${
                    notifications[item.key] ? "bg-rose-500" : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${
                      notifications[item.key]
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Logout — Full Width */}
        <button
          onClick={handleLogout}
          className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
      )}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-rose-50 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-rose-950">Mã PIN giao dịch</h2><p className="mt-1 text-sm text-rose-700">Tạo hoặc cập nhật PIN 4–6 chữ số.</p></div><Lock className="h-7 w-7 text-rose-600" /></div>
            <input value={transactionPin} onChange={(event) => setTransactionPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" autoComplete="new-password" placeholder="Nhập mã PIN" className="w-full rounded-xl border border-rose-200 bg-white p-3 text-center tracking-[0.4em] outline-none focus:ring-2 focus:ring-rose-400" />
            {pinMessage && <p className="mt-2 text-sm text-rose-700">{pinMessage}</p>}
            <div className="mt-5 flex gap-3"><button onClick={() => { setShowPinModal(false); setTransactionPin(""); setPinMessage(""); }} className="flex-1 rounded-xl bg-white px-4 py-3 font-semibold text-rose-700">Hủy</button><button onClick={() => void authApi.setTransactionPin(transactionPin).then(() => { setPinMessage("Đã cập nhật PIN"); setTransactionPin(""); void overviewQuery.refetch(); }).catch(() => setPinMessage("PIN không hợp lệ"))} disabled={!/^\d{4,6}$/.test(transactionPin)} className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Lưu PIN</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Password Change Modal =====
function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: "", new: "", confirm: "" });
  const [showPass, setShowPass] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.new !== form.confirm) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-in fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md animate-in slide-in-from-bottom-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Đổi mật khẩu</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <LogOut className="w-5 h-5 text-gray-400 rotate-180" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-gray-800">
              Đổi mật khẩu thành công!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              {
                key: "current" as const,
                label: "Mật khẩu hiện tại",
              },
              { key: "new" as const, label: "Mật khẩu mới" },
              {
                key: "confirm" as const,
                label: "Xác nhận mật khẩu mới",
              },
            ].map((field) => (
              <div key={field.key}>
                <label className="text-sm text-gray-600 mb-1 block font-medium">
                  {field.label}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type={showPass[field.key] ? "text" : "password"}
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 focus:ring-2 focus:ring-rose-500 outline-none text-gray-800"
                    value={form[field.key]}
                    onChange={(e) =>
                      setForm({ ...form, [field.key]: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPass({
                        ...showPass,
                        [field.key]: !showPass[field.key],
                      })
                    }
                    className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPass[field.key] ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {form.confirm && form.new !== form.confirm && (
              <p className="text-xs text-red-500">Mật khẩu không khớp</p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !form.current ||
                !form.new ||
                form.new !== form.confirm
              }
              className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
