import { useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { authApi } from "@/api/auth";
import {
  collectLoginRiskContext,
  LocationPermissionRequiredError,
  markLoginLocationConfirmed,
} from "@/lib/riskTelemetry";
import { useAuthStore } from "@/stores/authStore";

function safeReturnPath(value: unknown): string {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.startsWith("/confirm-location")
    ? value
    : "/dashboard";
}

/** Required once per browser session after a successful login. */
export default function LocationSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const returnTo = safeReturnPath((location.state as { returnTo?: unknown } | null)?.returnTo);

  const confirmLocation = async () => {
    if (!token || saving) return;
    setError("");
    setSaving(true);
    try {
      const clientContext = await collectLoginRiskContext();
      await authApi.recordLoginLocation({ client_context: clientContext });
      markLoginLocationConfirmed(token);
      navigate(returnTo, { replace: true });
    } catch (requestError: any) {
      setError(
        requestError instanceof LocationPermissionRequiredError
          ? requestError.message
          : requestError?.response?.data?.detail || "Không thể xác nhận vị trí. Hãy thử lại.",
      );
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-500 via-pink-600 to-fuchsia-700 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
          <MapPin className="h-8 w-8 text-rose-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Xác nhận vị trí đăng nhập</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          Để bảo vệ tài khoản khỏi đăng nhập bất thường, hãy cấp vị trí gần đúng trước khi tiếp tục.
        </p>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Hệ thống chỉ lưu vị trí đã làm tròn; IP và mã thiết bị được băm HMAC, không lưu dạng gốc.</p>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={() => void confirmLocation()}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-rose-600 py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? "Đang xác nhận..." : "Cấp quyền vị trí và tiếp tục"}
        </button>
        <button
          type="button"
          onClick={() => void leave()}
          disabled={saving}
          className="mt-3 w-full rounded-xl bg-slate-100 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          Đăng xuất
        </button>
      </section>
    </div>
  );
}
