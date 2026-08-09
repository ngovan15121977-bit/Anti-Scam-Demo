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
  Wallet,
  Banknote,
  Shield,
  Sparkles,
  Lightbulb,
  Lock,
  Star,
  Heart,
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

const tips = [
  { icon: Shield, text: "Kiểm tra kỹ số tài khoản trước khi chuyển" },
  { icon: Lock, text: "Không chuyển tiền cho người lạ qua mạng xã hội" },
  { icon: Sparkles, text: "AI sẽ quét tự động trước mỗi giao dịch" },
];

export default function TransferPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "review" | "ai-check" | "success">("form");
  const [form, setForm] = useState<TransferForm>({ recipient_account: "", recipient_name: "", bank_code: "", amount: "", note: "" });
  const [riskData, setRiskData] = useState<RiskAssessment | null>(null);
  const [txId, setTxId] = useState<string>("");

  const decisionMutation = useMutation({
    mutationFn: async ({ transactionId, decision, verified = false }: { transactionId: string; decision: "proceeded" | "cancelled"; verified?: boolean }) =>
      transactionsApi.decide(transactionId, decision, { verificationConfirmed: verified, verificationMethod: verified ? "user_confirmed_independent_check" : undefined }),
    onSuccess: (data) => {
      if (data.transaction_status === "completed") setStep("success");
      else if (data.transaction_status === "cancelled") { setStep("review"); setRiskData(null); }
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Không thể ghi nhận quyết định giao dịch"),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: TransferForm) => {
      const bank = banks.find((item) => item.code === data.bank_code);
      return transactionsApi.assess({ payee_account: data.recipient_account, payee_name: data.recipient_name, bank_code: bank?.name || data.bank_code, amount: Math.round(Number(data.amount)), note: data.note || undefined, currency: "VND" });
    },
    onSuccess: (data) => {
      setTxId(data.transaction_id);
      if (data.should_warn && data.warning) { setRiskData(data); setStep("ai-check"); return; }
      decisionMutation.mutate({ transactionId: data.transaction_id, decision: "proceeded" });
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Có lỗi xảy ra khi phân tích rủi ro"),
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.recipient_account || !form.recipient_name || !form.amount || !form.bank_code) return; setStep("review"); };
  const handleRiskCheck = () => analyzeMutation.mutate(form);
  const handleProceed = () => { if (!txId) return; decisionMutation.mutate({ transactionId: txId, decision: "proceeded", verified: true }); };
  const handleCancel = () => { if (!txId) return; decisionMutation.mutate({ transactionId: txId, decision: "cancelled" }); };
  const formatMoney = (amount: string) => { const num = parseFloat(amount); if (isNaN(num)) return "0 đ"; return new Intl.NumberFormat("vi-VN").format(num) + " đ"; };
  const isFormValid = form.recipient_account && form.recipient_name && form.amount && form.bank_code;

  if (step === "form") {
    return (
      <div className="min-h-screen bg-gray-50 w-full relative overflow-hidden">
        {/* Decorative Background */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-0 left-0 w-[450px] h-[450px] bg-gradient-to-br from-rose-200/30 to-pink-200/20 rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-to-br from-amber-200/25 to-orange-200/15 rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />
          <div className="absolute top-1/2 right-0 w-[300px] h-[300px] bg-gradient-to-br from-blue-200/20 to-violet-200/15 rounded-full blur-3xl translate-x-1/3" />
          <div className="absolute top-20 right-20 w-3 h-3 bg-rose-300 rounded-full opacity-30" />
          <div className="absolute bottom-32 left-20 w-2 h-2 bg-amber-300 rounded-full opacity-40" />
          <div className="absolute top-1/3 left-10 w-2 h-2 bg-pink-300 rounded-full opacity-30" />
        </div>

        <div className="relative z-10">
          <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-6 lg:px-8 xl:px-12 py-4 flex items-center gap-3 sticky top-0 z-20">
            <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
            <h1 className="text-lg font-bold text-gray-800">Chuyển tiền</h1>
          </div>

          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
            <div className="grid lg:grid-cols-12 gap-6">
              {/* Left Decorative Sidebar */}
              <div className="hidden xl:block lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Mẹo bảo mật</h3>
                  </div>
                  <div className="space-y-3">
                    {tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/80">
                        <tip.icon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-relaxed">{tip.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-200 relative overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-16 h-16 bg-white/10 rounded-full" />
                  <Heart className="w-5 h-5 text-white/40 mb-2" />
                  <p className="text-xs font-bold mb-1">Timi bảo vệ bạn</p>
                  <p className="text-[10px] text-rose-100">Đã chặn 1.2K giao dịch lừa đảo tháng này</p>
                </div>
              </div>

              {/* Main Form */}
              <div className="lg:col-span-7 xl:col-span-7 space-y-5">
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="relative">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Thông tin người nhận</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Số tài khoản</label>
                        <div className="relative">
                          <CreditCard className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          <input type="text" placeholder="Nhập số tài khoản" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none transition-shadow" value={form.recipient_account} onChange={(e) => setForm({ ...form, recipient_account: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tên người nhận</label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          <input type="text" placeholder="Nhập tên người nhận" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none transition-shadow" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">Ngân hàng</label>
                        <div className="relative">
                          <Building2 className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          <select className="w-full pl-11 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none appearance-none transition-shadow" value={form.bank_code} onChange={(e) => setForm({ ...form, bank_code: e.target.value })}>
                            <option value="">Chọn ngân hàng</option>
                            {banks.map((bank) => (<option key={bank.code} value={bank.code}>{bank.name}</option>))}
                          </select>
                          <ChevronRight className="absolute right-3.5 top-3 w-5 h-5 text-gray-400 rotate-90 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-50 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Số tiền</h2>
                    <div className="relative">
                      <input type="number" placeholder="0" className="w-full text-3xl sm:text-4xl font-bold text-gray-800 bg-transparent border-0 focus:ring-0 outline-none placeholder-gray-300" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                      <span className="absolute right-0 top-2 text-lg text-gray-500 font-semibold">VND</span>
                    </div>
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
                      {["50000", "100000", "200000", "500000", "1000000"].map((amount) => (
                        <button key={amount} onClick={() => setForm({ ...form, amount })} className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-600 hover:bg-rose-100 hover:text-rose-600 transition-colors whitespace-nowrap">{new Intl.NumberFormat("vi-VN").format(parseInt(amount))}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">Nội dung chuyển tiền</label>
                  <textarea placeholder="Nhập nội dung (không bắt buộc)" className="w-full p-3.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none resize-none transition-shadow" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>

                <button onClick={handleSubmit} disabled={!isFormValid} className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  <Send className="w-5 h-5" />Tiếp tục
                </button>
              </div>

              {/* Right Sidebar */}
              <div className="hidden lg:block lg:col-span-3 space-y-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Tóm tắt</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center"><Wallet className="w-5 h-5 text-rose-500" /></div>
                      <div><p className="text-xs text-gray-500">Số dư khả dụng</p><p className="font-bold text-gray-900">50.000.000 đ</p></div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Banknote className="w-5 h-5 text-blue-500" /></div>
                      <div><p className="text-xs text-gray-500">Hạn mức còn lại</p><p className="font-bold text-gray-900">100.000.000 đ</p></div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-emerald-500" /><p className="text-xs font-semibold text-emerald-700">AI Anti-Scam đang bảo vệ</p></div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-200 relative overflow-hidden">
                  <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
                  <Star className="w-5 h-5 text-white/40 mb-2" />
                  <p className="text-xs font-bold mb-1">Ưu đãi chuyển tiền</p>
                  <p className="text-[10px] text-violet-100">Miễn phí chuyển tiền đến 20 ngân hàng</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="min-h-screen bg-gray-50 w-full relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-gradient-to-br from-rose-200/30 to-pink-200/20 rounded-full blur-3xl -translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 right-0 w-[350px] h-[350px] bg-gradient-to-br from-amber-200/25 to-orange-200/15 rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />
        </div>
        <div className="relative z-10">
          <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 sm:px-6 lg:px-8 xl:px-12 py-4 flex items-center gap-3 sticky top-0 z-20">
            <button onClick={() => setStep("form")} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
            <h1 className="text-lg font-bold text-gray-800">Xác nhận giao dịch</h1>
          </div>
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="hidden xl:block lg:col-span-3" />
              <div className="lg:col-span-6">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="relative">
                    <div className="flex justify-between items-center py-2"><span className="text-gray-500 text-sm">Người nhận</span><span className="font-bold text-gray-900">{form.recipient_name}</span></div>
                    <div className="flex justify-between items-center py-2"><span className="text-gray-500 text-sm">Số tài khoản</span><span className="font-bold text-gray-900 font-mono">{form.recipient_account}</span></div>
                    <div className="flex justify-between items-center py-2"><span className="text-gray-500 text-sm">Ngân hàng</span><span className="font-bold text-gray-900">{banks.find(b => b.code === form.bank_code)?.name || form.bank_code}</span></div>
                    <hr className="border-gray-100" />
                    <div className="flex justify-between items-center py-2"><span className="text-gray-500 text-sm">Số tiền</span><span className="text-2xl font-bold text-rose-600">{formatMoney(form.amount)}</span></div>
                    {form.note && <div className="flex justify-between items-center py-2"><span className="text-gray-500 text-sm">Nội dung</span><span className="text-gray-800 text-right max-w-[60%] font-medium">{form.note}</span></div>}
                  </div>
                </div>
                <button onClick={handleRiskCheck} disabled={analyzeMutation.isPending} className="w-full mt-5 py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {analyzeMutation.isPending ? (<><Loader2 className="w-5 h-5 animate-spin" />AI đang kiểm tra...</>) : (<><ShieldAlert className="w-5 h-5" />Kiểm tra & Xác nhận</>)}
                </button>
              </div>
              <div className="hidden xl:block lg:col-span-3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "ai-check" && riskData) {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center p-4 relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-gradient-to-br from-rose-200/30 to-pink-200/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-gradient-to-br from-amber-200/25 to-orange-200/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10"><AIRiskModal riskData={riskData} onProceed={handleProceed} onCancel={handleCancel} isLoading={decisionMutation.isPending} /></div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center p-4 relative overflow-hidden">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-gradient-to-br from-emerald-200/30 to-teal-200/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/3 w-[350px] h-[350px] bg-gradient-to-br from-rose-200/25 to-pink-200/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 bg-white rounded-3xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle2 className="w-10 h-10 text-emerald-500" /></div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Chuyển tiền thành công!</h2>
          <p className="text-gray-500 mb-6">{formatMoney(form.amount)} đã được chuyển đến {form.recipient_name}</p>
          <div className="space-y-3">
            <button onClick={() => navigate("/history")} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98]">Xem lịch sử</button>
            <button onClick={() => { setStep("form"); setForm({ recipient_account: "", recipient_name: "", bank_code: "", amount: "", note: "" }); setRiskData(null); setTxId(""); }} className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]">Chuyển tiền khác</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}