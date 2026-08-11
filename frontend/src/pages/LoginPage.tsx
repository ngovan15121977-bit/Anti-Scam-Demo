import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (data) => {
      setAuth(data.access_token, data.user);
      const pinStatus = await authApi.transactionPinStatus();
      navigate(!pinStatus.configured ? "/me" : (data.user.role === "admin" ? "/admin" : "/dashboard"));
    },
    onError: (err: any) => {
      setErrors({ general: err.response?.data?.detail || "Sai email hoặc mật khẩu" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!form.email || !form.password) {
      setErrors({ general: "Vui lòng điền đầy đủ thông tin" });
      return;
    }
    loginMutation.mutate(form);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-momo-600 via-pink-700 to-momo-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-10">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-6">
          <Shield className="w-10 h-10 text-momo-600" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-1">AI Anti-Scam</h1>
        <p className="text-pink-200 text-sm mb-8">Bảo vệ ví tiền của bạn 24/7</p>

        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-800 text-center">Đăng nhập</h2>

          {errors.general && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-200 text-center">
              {errors.general}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="email"
                placeholder="Email"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-2xl border-0 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-momo-500 focus:bg-white transition-all outline-none"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Mật khẩu"
                className="w-full pl-12 pr-12 py-3 bg-gray-50 rounded-2xl border-0 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-momo-500 focus:bg-white transition-all outline-none"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loginMutation.isPending}
            className="w-full py-3.5 bg-momo-600 hover:bg-momo-700 text-white font-bold rounded-2xl shadow-lg shadow-pink-200 transition-all active:scale-95 disabled:opacity-70"
          >
            {loginMutation.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <div className="flex justify-between text-sm px-1">
            <Link to="/forgot-password" className="text-momo-600 font-medium hover:underline">
              Quên mật khẩu?
            </Link>
            <Link to="/register" className="text-momo-600 font-medium hover:underline">
              Đăng ký ngay
            </Link>
          </div>
        </div>
      </div>

      <div className="py-6 text-center text-pink-200 text-xs">
        © 2026 AI Anti-Scam Agent. Bảo vệ bạn mọi lúc.
      </div>
    </div>
  );
}
