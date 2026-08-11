import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";

export default function PinSetupPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN phải gồm 4–6 chữ số");
    if (pin !== confirm) return setError("Hai mã PIN không trùng nhau");
    setSaving(true);
    setError("");
    try {
      await authApi.setTransactionPin(pin);
      navigate(user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || "Không thể lưu mã PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-500 via-pink-600 to-fuchsia-700 flex items-center justify-center p-4">
      <form onSubmit={save} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100"><ShieldCheck className="h-8 w-8 text-rose-600" /></div>
        <h1 className="text-center text-2xl font-bold text-gray-900">Tạo mã PIN giao dịch</h1>
        <p className="mt-2 text-center text-sm text-gray-500">Bạn cần tạo PIN trước khi thực hiện giao dịch chuyển tiền.</p>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</p>}
        <label className="mt-5 block text-sm font-medium text-gray-700">Mã PIN mới</label>
        <div className="relative mt-2"><Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" /><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-3 text-center tracking-[0.4em] outline-none focus:ring-2 focus:ring-indigo-400" placeholder="4–6 số" /></div>
        <label className="mt-4 block text-sm font-medium text-gray-700">Nhập lại mã PIN</label>
        <input value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" inputMode="numeric" autoComplete="new-password" className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-center tracking-[0.4em] outline-none focus:ring-2 focus:ring-indigo-400" placeholder="Nhập lại PIN" />
        <button disabled={saving || !/^\d{4,6}$/.test(pin) || pin !== confirm} className="mt-6 w-full rounded-xl bg-rose-600 py-3 font-bold text-white disabled:opacity-50">{saving ? "Đang lưu..." : "Tạo PIN và tiếp tục"}</button>
      </form>
    </div>
  );
}
