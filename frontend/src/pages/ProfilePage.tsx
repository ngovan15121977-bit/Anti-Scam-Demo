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
  Building2,
  X,
  Loader2,
  Mic,
  MicOff,
  Search,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/api/auth";
import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();
  const {
    voiceMonitoringEnabled,
    setVoiceMonitoringEnabled,
    status: guardianStatus,
  } = useScamGuardian();
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
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [isVoicePreferenceUpdating, setIsVoicePreferenceUpdating] =
    useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const overviewQuery = useQuery({
    queryKey: ["account-overview"],
    queryFn: authApi.overview,
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const avatar = event.target.files?.[0];
    event.target.value = "";
    if (!avatar) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(avatar.type) ||
      avatar.size > 5 * 1024 * 1024
    ) {
      setAvatarError("Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.");
      return;
    }
    setAvatarError("");
    setAvatarFailed(false);
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authApi.uploadAvatar(avatar);
      updateUser(updatedUser);
      setIsAvatarPreviewOpen(false);
    } catch {
      setAvatarError("Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!user?.avatar_url || isUploadingAvatar) return;
    if (!window.confirm("Bạn có chắc muốn xóa ảnh đại diện không?")) return;

    setAvatarError("");
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authApi.deleteAvatar();
      updateUser(updatedUser);
      setAvatarFailed(false);
      setIsAvatarPreviewOpen(false);
    } catch {
      setAvatarError("Không thể xóa ảnh đại diện. Vui lòng thử lại.");
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
      accent: "from-violet-500 to-purple-600",
      bg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      icon: Bell,
      label: "Thông báo",
      desc: "Quản lý cài đặt thông báo",
      action: () => navigate("/notifications"),
      accent: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Lock,
      label: "Mã PIN giao dịch",
      desc: "Tạo hoặc cập nhật PIN khi chuyển tiền",
      action: () => setShowPinModal(true),
      accent: "from-fuchsia-500 to-pink-600",
      bg: "bg-fuchsia-50",
      iconColor: "text-fuchsia-600",
    },
    {
      icon: HelpCircle,
      label: "Trợ giúp",
      desc: "Câu hỏi thường gặp, liên hệ",
      action: () => navigate("/help"),
      accent: "from-slate-500 to-slate-700",
      bg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleVoiceMonitoringToggle = async () => {
    if (isVoicePreferenceUpdating) return;
    setIsVoicePreferenceUpdating(true);
    try {
      await setVoiceMonitoringEnabled(!voiceMonitoringEnabled);
    } finally {
      setIsVoicePreferenceUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-x-hidden">
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-[1100px] mx-auto">
        {/* ===== HEADER ===== */}
        <header className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2.5 hover:bg-white/70 rounded-full transition-colors"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Tài khoản
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Quản lý thông tin và bảo mật của bạn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2.5 bg-white rounded-full px-5 py-3 shadow-sm border border-violet-100 w-64">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                className="bg-transparent text-sm text-slate-700 outline-none w-full placeholder:text-slate-400"
                readOnly
              />
            </div>
            <button className="relative p-3 bg-white rounded-full shadow-sm border border-violet-100 hover:bg-violet-50 transition-colors">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-violet-500 rounded-full" />
            </button>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 pb-10 space-y-6">
          {/* ===== HERO PROFILE CARD ===== */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 sm:p-8 text-white shadow-xl shadow-violet-200/50">
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full" />
            <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-white/5 rounded-full" />
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full" />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  role={user?.avatar_url && !avatarFailed ? "button" : undefined}
                  tabIndex={user?.avatar_url && !avatarFailed ? 0 : undefined}
                  onClick={() =>
                    user?.avatar_url &&
                    !avatarFailed &&
                    setIsAvatarPreviewOpen(true)
                  }
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" || event.key === " ") &&
                      user?.avatar_url &&
                      !avatarFailed
                    ) {
                      event.preventDefault();
                      setIsAvatarPreviewOpen(true);
                    }
                  }}
                  className={`w-24 h-24 sm:w-28 sm:h-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-4 border-white/30 overflow-hidden shadow-lg ${
                    user?.avatar_url && !avatarFailed ? "cursor-pointer" : ""
                  }`}
                >
                  {user?.avatar_url && !avatarFailed ? (
                    <img
                      src={user.avatar_url}
                      onError={() => setAvatarFailed(true)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void handleAvatarChange(event)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() =>
                    user?.avatar_url && !avatarFailed
                      ? setIsAvatarPreviewOpen(true)
                      : avatarInputRef.current?.click()
                  }
                  disabled={isUploadingAvatar}
                  aria-label="Đổi ảnh đại diện"
                  title="Đổi ảnh đại diện"
                  className="absolute bottom-0 right-0 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-violet-600" />
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-bold truncate">
                  {user?.full_name || "Người dùng"}
                </h2>
                <p className="text-violet-100 text-base mt-1 truncate">
                  {user?.email || "email@example.com"}
                </p>
                <div className="flex flex-wrap items-center gap-2.5 mt-3">
                  <span className="px-3.5 py-1.5 bg-white/20 backdrop-blur rounded-full text-sm font-semibold">
                    {user?.role === "admin" ? "Admin" : "Thành viên"}
                  </span>
                  {user?.is_active && (
                    <span className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/30 backdrop-blur rounded-full text-sm font-semibold text-emerald-100">
                      <CheckCircle2 className="w-4 h-4" />
                      Đã xác minh
                    </span>
                  )}
                </div>
              </div>
            </div>

            {avatarError && (
              <p className="relative z-10 mt-4 text-sm text-violet-100 bg-white/10 rounded-xl px-4 py-2">
                {avatarError}
              </p>
            )}

            {/* Stats */}
            <div className="relative z-10 mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[
                {
                  value: new Intl.NumberFormat("vi-VN").format(
                    overview?.balance ?? user?.balance ?? 0,
                  ),
                  label: "Số dư (VND)",
                },
                {
                  value: overview?.transactions_today ?? "—",
                  label: "Giao dịch hôm nay",
                },
                {
                  value: overview?.transactions_this_month ?? "—",
                  label: "Giao dịch tháng",
                },
                {
                  value: overview?.security_grade ?? "—",
                  label: overview
                    ? `Điểm bảo mật ${overview.security_score}/100`
                    : "Điểm bảo mật",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/15 backdrop-blur-md rounded-2xl p-4 text-center border border-white/10"
                >
                  <p className="text-xl sm:text-2xl font-bold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs sm:text-sm text-violet-100 mt-1.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ===== SECURITY SCORE ===== */}
          <section className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-50 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Điểm bảo mật
                  </h3>
                  <p className="text-sm text-slate-500">
                    Các lớp bảo vệ đã có và còn thiếu
                  </p>
                </div>
              </div>
              <p className="text-right text-2xl sm:text-3xl font-black text-violet-600">
                {overview
                  ? `${overview.security_grade} · ${overview.security_score}/100`
                  : "Đang tải"}
              </p>
            </div>

            <div className="p-6">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${overview?.security_score ?? 0}%` }}
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overview?.security_checks.map((check) => (
                  <div
                    key={check.label}
                    className={`rounded-xl border p-4 transition-colors ${
                      check.completed
                        ? "border-emerald-100 bg-emerald-50/60"
                        : "border-amber-100 bg-amber-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">
                        {check.label}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 ${
                          check.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {check.completed
                          ? `+${check.score}`
                          : `Còn +${check.score}`}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {check.completed ? "Đã kích hoạt" : check.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {overview && !overview.transaction_pin_configured && (
                  <button
                    onClick={() => navigate("/setup-pin")}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                  >
                    Tạo PIN giao dịch (+30 điểm)
                  </button>
                )}
                {overview &&
                  overview.transaction_pin_configured &&
                  overview.security_checks.some(
                    (check) =>
                      check.label === "Khuôn mặt" && !check.completed,
                  ) && (
                    <button
                      onClick={() => navigate("/setup-face")}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white hover:shadow-lg shadow-violet-200 transition-all"
                    >
                      Cài đặt khuôn mặt (+30 điểm)
                    </button>
                  )}
              </div>
            </div>
          </section>

          {/* ===== TWO COLUMN: Personal + Settings ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Thông tin cá nhân
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {[
                  {
                    icon: User,
                    label: "Họ và tên",
                    value: user?.full_name || "Chưa cập nhật",
                    bg: "bg-violet-50",
                    color: "text-violet-600",
                  },
                  {
                    icon: Mail,
                    label: "Email",
                    value: user?.email || "Chưa cập nhật",
                    bg: "bg-blue-50",
                    color: "text-blue-600",
                  },
                  {
                    icon: Phone,
                    label: "Số điện thoại",
                    value: user?.phone || "Chưa cập nhật",
                    bg: "bg-emerald-50",
                    color: "text-emerald-600",
                  },
                  {
                    icon: Building2,
                    label: "Tài khoản Timi Bank",
                    value:
                      user?.timi_bank_enabled && user.phone
                        ? user.phone
                        : "Chưa đủ điều kiện dùng Timi Bank",
                    bg: "bg-fuchsia-50",
                    color: "text-fuchsia-600",
                    mono: true,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-violet-50/40 transition-colors"
                  >
                    <div
                      className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center shrink-0`}
                    >
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-500">{item.label}</p>
                      <p
                        className={`font-semibold text-slate-900 truncate text-base ${
                          item.mono ? "font-mono" : ""
                        }`}
                      >
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settings Menu */}
            <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Cài đặt
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {/* Voice monitoring */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-violet-50/40 transition-colors">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      voiceMonitoringEnabled ? "bg-emerald-50" : "bg-slate-100"
                    }`}
                  >
                    {voiceMonitoringEnabled ? (
                      <Mic className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <MicOff className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-slate-900 text-base">
                      Tự động nghe và bảo vệ cuộc gọi
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {voiceMonitoringEnabled
                        ? guardianStatus === "active"
                          ? "Đang hoạt động ngầm khi bạn sử dụng ứng dụng"
                          : "Đang bật, sẽ tự khởi động lại khi cần"
                        : "Đã tắt, Timi sẽ không truy cập microphone"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceMonitoringEnabled}
                    aria-label="Bật hoặc tắt tự động nghe và bảo vệ cuộc gọi"
                    onClick={() => void handleVoiceMonitoringToggle()}
                    disabled={isVoicePreferenceUpdating}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${
                      voiceMonitoringEnabled ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                        voiceMonitoringEnabled
                          ? "translate-x-7"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="flex items-center gap-4 px-6 py-4 w-full hover:bg-violet-50/40 transition-colors group"
                  >
                    <div
                      className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-semibold text-slate-900 text-base">
                        {item.label}
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ===== NOTIFICATION TOGGLES ===== */}
          <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Thông báo
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
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
                  className="flex items-center justify-between px-6 py-4 hover:bg-violet-50/40 transition-colors"
                >
                  <div className="min-w-0 pr-4">
                    <p className="font-semibold text-slate-900 text-base">
                      {item.label}
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() =>
                      setNotifications({
                        ...notifications,
                        [item.key]: !notifications[item.key],
                      })
                    }
                    className={`shrink-0 w-14 h-8 rounded-full transition-colors relative ${
                      notifications[item.key] ? "bg-violet-600" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full absolute top-1 shadow-sm transition-transform ${
                        notifications[item.key]
                          ? "translate-x-7"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ===== LOGOUT ===== */}
          <button
            onClick={handleLogout}
            className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 text-base border border-red-100"
          >
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
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

      {/* Password Change Modal */}
      {showPasswordModal && (
        <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl border border-violet-100">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Mã PIN giao dịch
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tạo hoặc cập nhật PIN 4–6 chữ số.
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                <Lock className="h-6 w-6 text-violet-600" />
              </div>
            </div>
            <input
              value={transactionPin}
              onChange={(event) =>
                setTransactionPin(
                  event.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              inputMode="numeric"
              type="password"
              autoComplete="new-password"
              placeholder="Nhập mã PIN"
              className="w-full rounded-xl border border-violet-200 bg-slate-50 p-4 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 transition-all"
            />
            {pinMessage && (
              <p className="mt-3 text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                {pinMessage}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setTransactionPin("");
                  setPinMessage("");
                }}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() =>
                  void authApi
                    .setTransactionPin(transactionPin)
                    .then(() => {
                      setPinMessage("Đã cập nhật PIN");
                      setTransactionPin("");
                      void overviewQuery.refetch();
                    })
                    .catch(() => setPinMessage("PIN không hợp lệ"))
                }
                disabled={!/^\d{4,6}$/.test(transactionPin)}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50 hover:shadow-lg shadow-violet-200 transition-all"
              >
                Lưu PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Preview Modal */}
      {isAvatarPreviewOpen && user?.avatar_url && !avatarFailed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setIsAvatarPreviewOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-violet-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Ảnh đại diện</h2>
              <button
                type="button"
                onClick={() => setIsAvatarPreviewOpen(false)}
                aria-label="Đóng ảnh đại diện"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={user.avatar_url}
              alt="Ảnh đại diện phóng to"
              className="mx-auto max-h-[65vh] w-full rounded-2xl object-contain"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white disabled:opacity-60 hover:shadow-lg transition-all"
              >
                {isUploadingAvatar && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isUploadingAvatar ? "Đang thay ảnh..." : "Thay ảnh"}
              </button>
              <button
                type="button"
                onClick={() => void handleAvatarDelete()}
                disabled={isUploadingAvatar}
                className="flex-1 rounded-xl bg-red-50 px-4 py-3.5 font-semibold text-red-600 disabled:opacity-60 hover:bg-red-100 transition-colors"
              >
                Xóa ảnh
              </button>
            </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-in fade-in backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-7 w-full max-w-md animate-in slide-in-from-bottom-10 border border-violet-100 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Đổi mật khẩu</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-slate-800">
              Đổi mật khẩu thành công!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {(
              [
                { key: "current" as const, label: "Mật khẩu hiện tại" },
                { key: "new" as const, label: "Mật khẩu mới" },
                { key: "confirm" as const, label: "Xác nhận mật khẩu mới" },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="text-sm text-slate-600 mb-1.5 block font-medium">
                  {field.label}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type={showPass[field.key] ? "text" : "password"}
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 rounded-xl border border-transparent focus:ring-2 focus:ring-violet-400 focus:border-violet-300 outline-none text-slate-800 transition-all"
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
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600"
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
              <p className="text-sm text-red-500">Mật khẩu không khớp</p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !form.current ||
                !form.new ||
                form.new !== form.confirm
              }
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
