import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      navigate(data.user.role === "admin" ? "/admin" : "/dashboard");
    },
    onError: (err: any) => setError(err.response?.data?.detail || "Đăng nhập thất bại"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate(form);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 px-4">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AI Anti-Scam Agent</h1>
          <p className="mt-2 text-sm text-gray-500">Đăng nhập để bảo vệ giao dịch</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
          
          <div className="relative">
            <Mail className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
            <Input label="Email" type="email" className="pl-10" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          </div>
          
          <div className="relative">
            <Lock className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
            <Input label="Mật khẩu" type="password" className="pl-10" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          </div>

          <Button type="submit" className="w-full" isLoading={loginMutation.isPending}>Đăng nhập</Button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Chưa có tài khoản? <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-500">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}