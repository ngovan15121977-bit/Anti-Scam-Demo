import { useState } from "react";
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

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [notifications, setNotifications] = useState({
    transaction: true,
    security: true,
    promotion: false,
  });

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
      icon: HelpCircle,
      label: "Trợ giúp",
      desc: "Câu hỏi thường gặp, liên hệ",
      action: () => navigate("/help"),
    },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Tài khoản</h1>
      </div>

      {/* Profile Card */}
      <div className="p-4">
        <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg shadow-rose-200">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center border-2 border-white/30">
                <User className="w-10 h-10 text-white" />
              </div>
              <button className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-md">
                <Camera className="w-4 h-4 text-rose-600" />
              </button>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">{user?.full_name || "Người dùng"}</h2>
              <p className="text-rose-100 text-sm">{user?.email || "email@example.com"}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                  {user?.role === "admin" ? "Admin" : "Thành viên"}
                </span>
                {user?.is_active && (
                  <span className="flex items-center gap-1 text-xs text-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Đã xác minh
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{new Intl.NumberFormat("vi-VN").format(user?.balance || 0)}</p>
              <p className="text-xs text-rose-100">Số dư (VND)</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">12</p>
              <p className="text-xs text-rose-100">Giao dịch hôm nay</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Thông tin cá nhân</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-rose-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">Họ và tên</p>
              <p className="font-semibold text-gray-800">{user?.full_name || "Chưa cập nhật"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-semibold text-gray-800">{user?.email || "Chưa cập nhật"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500">Số điện thoại</p>
              <p className="font-semibold text-gray-800">{user?.phone || "Chưa cập nhật"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Cài đặt</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="flex items-center gap-4 p-4 w-full hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                <item.icon className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>
          ))}
        </div>
      </div>

      {/* Notification Settings */}
      <div className="px-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Thông báo</h3>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-gray-800">Giao dịch</p>
              <p className="text-xs text-gray-400">Nhận thông báo khi có giao dịch mới</p>
            </div>
            <button
              onClick={() => setNotifications({ ...notifications, transaction: !notifications.transaction })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                notifications.transaction ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                notifications.transaction ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-gray-800">Bảo mật</p>
              <p className="text-xs text-gray-400">Cảnh báo khi phát hiện đăng nhập lạ</p>
            </div>
            <button
              onClick={() => setNotifications({ ...notifications, security: !notifications.security })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                notifications.security ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                notifications.security ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="font-semibold text-gray-800">Khuyến mãi</p>
              <p className="text-xs text-gray-400">Thông báo ưu đãi và khuyến mãi</p>
            </div>
            <button
              onClick={() => setNotifications({ ...notifications, promotion: !notifications.promotion })}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                notifications.promotion ? "bg-rose-500" : "bg-gray-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${
                notifications.promotion ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 pb-8">
        <button
          onClick={handleLogout}
          className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}

// ===== Password Change Modal =====
function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: "", new: "", confirm: "" });
  const [showPass, setShowPass] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.new !== form.confirm) return;
    setLoading(true);
    // API call here
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-in fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm animate-in slide-in-from-bottom-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Đổi mật khẩu</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <LogOut className="w-5 h-5 text-gray-400 rotate-180" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-gray-800">Đổi mật khẩu thành công!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Mật khẩu hiện tại</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type={showPass.current ? "text" : "password"}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 focus:ring-2 focus:ring-rose-500 outline-none"
                  value={form.current}
                  onChange={(e) => setForm({ ...form, current: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPass({ ...showPass, current: !showPass.current })}
                  className="absolute right-3 top-3 text-gray-400"
                >
                  {showPass.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Mật khẩu mới</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type={showPass.new ? "text" : "password"}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 focus:ring-2 focus:ring-rose-500 outline-none"
                  value={form.new}
                  onChange={(e) => setForm({ ...form, new: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPass({ ...showPass, new: !showPass.new })}
                  className="absolute right-3 top-3 text-gray-400"
                >
                  {showPass.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Xác nhận mật khẩu mới</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type={showPass.confirm ? "text" : "password"}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 focus:ring-2 focus:ring-rose-500 outline-none"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPass({ ...showPass, confirm: !showPass.confirm })}
                  className="absolute right-3 top-3 text-gray-400"
                >
                  {showPass.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {form.confirm && form.new !== form.confirm && (
                <p className="text-xs text-red-500 mt-1">Mật khẩu không khớp</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !form.current || !form.new || form.new !== form.confirm}
              className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}