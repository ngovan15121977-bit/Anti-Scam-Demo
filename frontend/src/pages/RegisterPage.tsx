import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock, User } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      navigate("/dashboard");
    },
    onError: (err: any) => setErrors({ general: err.response?.data?.detail || "Đăng ký thất bại" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (form.password.length < 8) { setErrors({ password: "Mật khẩu ít nhất 8 ký tự" }); return; }
    if (form.password !== form.confirmPassword) { setErrors({ confirmPassword: "Mật khẩu không khớp" }); return; }
    const { confirmPassword, ...payload } = form;
    registerMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 px-4 py-8">
      <div className="card w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tạo tài khoản</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{errors.general}</div>}
          
          <div className="relative"><User className="