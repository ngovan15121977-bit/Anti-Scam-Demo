import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock, User, Eye, EyeOff, Phone } from "lucide-react";
import { authApi } from "@/api/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => {
      navigate("/login", {
        replace: true,
        state: { registrationEmail: form.email },
      });
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      const translateValidationMessage = (value: string) => {
        if (/valid email address|special-use|reserved name/i.test(value)) {
          return "Địa chỉ email không hợp lệ. Vui lòng sử dụng email thật, ví dụ: tenban@gmail.com.";
        }
        return value;
      };
      const message = Array.isArray(detail)
        ? detail
            .map((item: unknown) => {
              if (typeof item === "string") return translateValidationMessage(item);
              if (item && typeof item === "object" && "msg" in item) {
                return translateValidationMessage(String((item as { msg: unknown }).msg));
              }
              return "Dữ liệu đăng ký không hợp lệ";
            })
            .join("; ")
        : typeof detail === "string"
          ? translateValidationMessage(detail)
          : "Đăng ký thất bại";
      setErrors({ general: message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (form.password.length < 8) {
      setErrors({ password: "Mật khẩu ít nhất 8 ký tự" });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: "Mật khẩu không khớp" });
      return;
    }
    if (!/^\d{10}$/.test(form.phone)) {
      setErrors({ phone: "Số điện thoại phải gồm đúng 10 chữ số; đây cũng là số tài khoản Timi Bank." });
      return;
    }
    const { confirmPassword, ...payload } = form;
    registerMutation.mutate(payload);
  };

  const inputClass = "w-full pl-12 pr-4 py-3 bg-gray-50 rounded-2xl border-0 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-momo-500 focus:bg-white transition-all outline-none";

  return (
    <div className="min-h-screen bg-gradient-to-br from-momo-600 via-momo-700 to-momo-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-4">
          <Shield className="w-8 h-8 text-momo-600" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-6">Tạo tài khoản</h1>

        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4">
          {errors.general && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600 border border-red-200 text-center">
              {errors.general}
            </div>
          )}

          <div className="relative">
            <User className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Họ và tên" className={inputClass}
              value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>

          <div className="relative">
            <Phone className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input type="tel" inputMode="numeric" required maxLength={10} placeholder="Số điện thoại 10 số (cũng là STK Timi)" className={inputClass}
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
          </div>
          {errors.phone && <p className="text-xs text-red-500 ml-1">{errors.phone}</p>}

          <div className="relative">
            <Mail className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input type="email" placeholder="Email" className={inputClass}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input type={showPass ? "text" : "password"} placeholder="Mật khẩu" className={inputClass}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-gray-400">
              {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-red-500 ml-1">{errors.password}</p>}

          <div className="relative">
            <Lock className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input type={showConfirmPass ? "text" : "password"} placeholder="Xác nhận mật khẩu" className={inputClass + " pr-12"}
              value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
            <button type="button" onClick={() => setShowConfirmPass(!showConfirmPass)} className="absolute right-4 top-3.5 text-gray-400" aria-label={showConfirmPass ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"}>
              {showConfirmPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-xs text-red-500 ml-1">{errors.confirmPassword}</p>}

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full py-3.5 bg-momo-600 hover:bg-momo-700 text-white font-bold rounded-2xl shadow-lg shadow-momo-200 transition-all active:scale-95 disabled:opacity-70 mt-2"
          >
            {registerMutation.isPending ? "Đang xử lý..." : "Đăng ký"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Đã có tài khoản?{" "}
            <Link to="/login" className="text-momo-600 font-semibold hover:underline">
              Đăng nhập
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
