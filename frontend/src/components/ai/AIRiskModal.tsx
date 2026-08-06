import { X, ShieldAlert, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { useState } from "react";

interface AIRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  riskScore: number;
  riskReason: string;
  transactionId: string;
  onContinue: () => void; // User vẫn muốn tiếp tục (gửi lại với force=true)
  onCancel: () => void;   // User hủy giao dịch
}

export default function AIRiskModal({
  isOpen,
  onClose,
  riskScore,
  riskReason,
  transactionId,
  onContinue,
  onCancel,
}: AIRiskModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isHighRisk = riskScore >= 0.8;
  const isMediumRisk = riskScore >= 0.5 && riskScore < 0.8;

  const getRiskColor = () => {
    if (isHighRisk) return "text-red-600 bg-red-50 border-red-200";
    if (isMediumRisk) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-rose-600 bg-rose-50 border-rose-200";
  };

  const getRiskIcon = () => {
    if (isHighRisk) return <ShieldX className="w-12 h-12 text-red-500" />;
    if (isMediumRisk) return <ShieldAlert className="w-12 h-12 text-amber-500" />;
    return <ShieldCheck className="w-12 h-12 text-rose-500" />;
  };

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      await onContinue();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className={`p-6 text-center border-b ${getRiskColor()}`}>
          <div className="flex justify-center mb-3">{getRiskIcon()}</div>
          <h3 className="text-xl font-bold text-slate-900">
            {isHighRisk ? "🚨 Giao dịch bị chặn!" : "⚠️ Cảnh báo rủi ro"}
          </h3>
          <p className="text-sm mt-1 opacity-80">
            AI Anti-Scam đã phát hiện dấu hiệu bất thường
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Risk Score Bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Mức độ rủi ro</span>
              <span className={`font-bold ${
                isHighRisk ? "text-red-600" : isMediumRisk ? "text-amber-600" : "text-rose-600"
              }`}>
                {Math.round(riskScore * 100)}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHighRisk ? "bg-red-500 w-[90%]" : isMediumRisk ? "bg-amber-500 w-[65%]" : "bg-rose-400 w-[40%]"
                }`}
              />
            </div>
          </div>

          {/* Risk Reason */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Lý do cảnh báo
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{riskReason}</p>
          </div>

          {/* Transaction ID */}
          <p className="text-xs text-slate-400 text-center">
            Mã giao dịch: <span className="font-mono">{transactionId}</span>
          </p>

          {isHighRisk && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
              <p className="text-sm text-red-700 font-medium">
                Giao dịch này đã bị tạm dừng và gửi đến admin để xem xét.
              </p>
              <p className="text-xs text-red-500 mt-1">
                Bạn không thể tự tiếp tục giao dịch này.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Hủy giao dịch
          </button>

          {!isHighRisk && (
            <button
              onClick={handleContinue}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-rose-600 text-white font-medium rounded-xl hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                "Vẫn tiếp tục"
              )}
            </button>
          )}

          {isHighRisk && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors"
            >
              Đã hiểu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}