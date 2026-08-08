import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { AssessResponse } from "@/api/transactions";

export type RiskAssessment = AssessResponse;

interface AIRiskModalProps {
  riskData: RiskAssessment;
  onProceed: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function remainingSeconds(displayedAt: string, countdownSeconds: number): number {
  const deadline = new Date(displayedAt).getTime() + countdownSeconds * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function AIRiskModal({
  riskData,
  onProceed,
  onCancel,
  isLoading,
}: AIRiskModalProps) {
  const warning = riskData.warning;
  const [verified, setVerified] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    warning ? remainingSeconds(warning.displayed_at, warning.countdown_seconds) : 0,
  );

  useEffect(() => {
    if (!warning) return undefined;

    const updateCountdown = () => {
      setRemaining(remainingSeconds(warning.displayed_at, warning.countdown_seconds));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(timer);
  }, [warning]);

  const isHighRisk = riskData.risk_level === "high";
  const canProceed = remaining === 0 && verified && !isLoading;
  const riskPercentage = Math.round(riskData.risk_score * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className={`p-6 text-center ${isHighRisk ? "bg-red-50" : "bg-amber-50"}`}>
          <div className="mb-3 flex justify-center">
            {isHighRisk ? (
              <ShieldX className="h-12 w-12 text-red-600" />
            ) : (
              <ShieldAlert className="h-12 w-12 text-amber-600" />
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {warning?.title ?? "Cảnh báo rủi ro"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Hệ thống cảnh báo, còn quyết định cuối cùng vẫn thuộc về bạn.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-slate-600">Mức độ rủi ro</span>
              <span className={isHighRisk ? "font-bold text-red-600" : "font-bold text-amber-600"}>
                {riskPercentage}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={isHighRisk ? "h-full bg-red-500" : "h-full bg-amber-500"}
                style={{ width: `${Math.max(8, riskPercentage)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Lý do cảnh báo
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {warning?.transparency_reason ?? riskData.explanation}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
            {warning?.message ?? riskData.recommendation}
          </div>

          {remaining > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="font-semibold text-amber-800">Vui lòng cân nhắc trong {remaining} giây</p>
              <p className="mt-1 text-xs text-amber-700">Nút tiếp tục sẽ được mở khi countdown kết thúc.</p>
            </div>
          ) : (
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <input
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span>Tôi đã kiểm tra lại thông tin người nhận qua kênh độc lập.</span>
            </label>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy giao dịch
          </button>
          <button
            onClick={onProceed}
            disabled={!canProceed}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Vẫn tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}
