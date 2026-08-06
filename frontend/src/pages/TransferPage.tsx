import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  ShieldAlert,
  CheckCircle2,
  User,
  Building2,
  CreditCard,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { transactionsApi } from "@/api/transactions";
import AIRiskModal, { type RiskAssessment } from "@/components/ai/AIRiskModal";

interface TransferForm {
  recipient_account: string;
  recipient_name: string;
  bank_code: string;
  amount: string;
  note: string;
}

const banks = [
  { code: "VCB", name: "Vietcombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "MBB", name: "MB Bank" },
  { code: "ACB", name: "ACB" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
];

export default function TransferPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "review" | "ai-check" | "success">("form");
  const [form, setForm] = useState<TransferForm>({
    recipient_account: "",
    recipient_name: "",
    bank_code: "",
    amount: "",
    note: "",
  });
  const [riskData, setRiskData] = useState<RiskAssessment | null>(null);
  const [txId, setTxId] = useState<string>("");

  // ✅ SỬA: Dùng transactionsApi.analyze thay vì fetch trực tiếp
  const analyzeMutation = useMutation({
    mutationFn: async (data: TransferForm) => {
      const bank = banks.find(b => b.code === data.bank_code);
      const res = await transactionsApi.analyze({
        recipient_account: data.recipient_account,
        recipient_bank: bank?.name || data.bank_code,
        recipient_name: data.recipient_name,// Gửi "MB Bank" thay vì "MBB"
        amount: parseFloat(data.amount),
        description: data.note,
      });
      return res;
    },
    onSuccess: (data) => {
      // Lưu transaction ID
      if (data.id) setTxId(data.id);

      // Nếu risk cao, hiện modal
      if (data.risk_analysis?.risk_level === "high" || data.risk_analysis?.risk_level === "critical") {
        setRiskData(data.risk_analysis);
        setStep("ai-check");
      } else {
        // Risk thấp, chuyển luôn
        setStep("success");
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Có lỗi xảy ra khi phân tích rủi ro");
    },
  });

  // ✅ SỬA: Dùng transactionsApi.decide + transactionsApi.transfer
  const transferMutation = useMutation({
    mutationFn: async (decision: "confirmed" | "cancelled") => {
      if (!txId) throw new Error("Không có mã giao dịch");

      // Bước 1: Gửi quyết định
      await transactionsApi.decide(txId, decision);

      // Bước 2: Nếu confirmed, thực hiện chuyển tiền
      if (decision === "confirmed") {
        const bank = banks.find(b => b.code === form.bank_code);
        await transactionsApi.transfer({
          toAccount: form.recipient_account,
          amount: parseFloat(form.amount),
          description: form.note,
          pin: "123456", // TODO: Thêm input PIN
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      setStep("success");
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Có lỗi xảy ra khi chuyển tiền");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipient_account || !form.recipient_name || !form.amount || !form.bank_code) return;
    setStep("review");
  };

  const handleRiskCheck = () => {
    analyzeMutation.mutate(form);
  };

  const handleProceed = () => {
    transferMutation.mutate("confirmed");
  };

  const handleCancel = () => {
    if (txId) {
      transferMutation.mutate("cancelled");
    }
    setStep("review");
    setRiskData(null);
  };

  const formatMoney = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return "0 đ";
    return new Intl.NumberFormat("vi-VN").format(num) + " đ";
  };

  // ===== STEP: FORM =====
  if (step === "form") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Chuyển tiền</h1>
        </div>

        <div className="p-4 space-y-4">
          {/* Recipient Info */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Thông tin người nhận</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Số tài khoản</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nhập số tài khoản"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    value={form.recipient_account}
                    onChange={(e) => setForm({ ...form, recipient_account: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Tên người nhận</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nhập tên người nhận"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none"
                    value={form.recipient_name}
                    onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Ngân hàng</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <select
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none appearance-none"
                    value={form.bank_code}
                    onChange={(e) => setForm({ ...form, bank_code: e.target.value })}
                  >
                    <option value="">Chọn ngân hàng</option>
                    {banks.map((bank) => (
                      <option key={bank.code} value={bank.code}>{bank.name}</option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-3 w-5 h-5 text-gray-400 rotate-90" />
                </div>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Số tiền</h2>
            <div className="relative">
              <input
                type="number"
                placeholder="0"
                className="w-full text-3xl font-bold text-gray-800 bg-transparent border-0 focus:ring-0 outline-none placeholder-gray-300"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <span className="absolute right-0 top-2 text-lg text-gray-500 font-medium">VND</span>
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {["50000", "100000", "200000", "500000", "1000000"].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setForm({ ...form, amount })}
                  className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-rose-100 hover:text-rose-600 transition-colors whitespace-nowrap"
                >
                  {new Intl.NumberFormat("vi-VN").format(parseInt(amount))}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <label className="text-sm text-gray-600 mb-1 block">Nội dung chuyển tiền</label>
            <textarea
              placeholder="Nhập nội dung (không bắt buộc)"
              className="w-full p-3 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none resize-none"
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!form.recipient_account || !form.recipient_name || !form.amount || !form.bank_code}
            className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Tiếp tục
          </button>
        </div>
      </div>
    );
  }

  // ===== STEP: REVIEW =====
  if (step === "review") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setStep("form")} className="p-2 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Xác nhận giao dịch</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Người nhận</span>
              <span className="font-semibold text-gray-800">{form.recipient_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Số tài khoản</span>
              <span className="font-semibold text-gray-800">{form.recipient_account}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Ngân hàng</span>
              <span className="font-semibold text-gray-800">
                {banks.find(b => b.code === form.bank_code)?.name || form.bank_code}
              </span>
            </div>
            <hr className="border-gray-100" />
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Số tiền</span>
              <span className="text-xl font-bold text-rose-600">{formatMoney(form.amount)}</span>
            </div>
            {form.note && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Nội dung</span>
                <span className="text-gray-800 text-right max-w-[60%]">{form.note}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleRiskCheck}
            disabled={analyzeMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                AI đang kiểm tra...
              </>
            ) : (
              <>
                <ShieldAlert className="w-5 h-5" />
                Kiểm tra & Xác nhận
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===== STEP: AI CHECK =====
  if (step === "ai-check" && riskData) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AIRiskModal
          riskData={riskData}
          onProceed={handleProceed}
          onCancel={handleCancel}
          isLoading={transferMutation.isPending}
        />
      </div>
    );
  }

  // ===== STEP: SUCCESS =====
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Chuyển tiền thành công!</h2>
          <p className="text-gray-500 mb-6">
            {formatMoney(form.amount)} đã được chuyển đến {form.recipient_name}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/history")}
              className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
            >
              Xem lịch sử
            </button>
            <button
              onClick={() => {
                setStep("form");
                setForm({ recipient_account: "", recipient_name: "", bank_code: "", amount: "", note: "" });
                setRiskData(null);
                setTxId("");
              }}
              className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg transition-all"
            >
              Chuyển tiền khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}