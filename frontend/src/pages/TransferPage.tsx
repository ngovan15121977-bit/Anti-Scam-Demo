import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  QrCode,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { transactionsApi } from "@/api/transactions";
import { authApi } from "@/api/auth";
import AIRiskModal, { type RiskAssessment } from "@/components/ai/AIRiskModal";
import FaceVerificationModal from "@/components/auth/FaceVerificationModal";
import { collectRiskClientContext } from "@/lib/riskTelemetry";
import { useAuthStore } from "@/stores/authStore";

interface TransferForm {
  recipient_account: string;
  recipient_name: string;
  recipient_lookup_token: string;
  bank_code: string;
  amount: string;
  note: string;
}

type RecipientLookupState =
  | { status: "idle"; message?: string }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

const banks = [
  { code: "ABB", name: "ABBank" },
  { code: "ACB", name: "ACB" },
  { code: "AGRIBANK", name: "Agribank" },
  { code: "BAB", name: "Bac A Bank" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "BVB", name: "BaoViet Bank" },
  { code: "CAKE", name: "Cake by VPBank" },
  { code: "CIMB", name: "CIMB Vietnam" },
  { code: "CTG", name: "VietinBank" },
  { code: "EIB", name: "Eximbank" },
  { code: "GPB", name: "GPBank" },
  { code: "HDB", name: "HDBank" },
  { code: "HSBC", name: "HSBC Vietnam" },
  { code: "IVB", name: "Indovina Bank" },
  { code: "KBANK", name: "Kasikornbank" },
  { code: "KLB", name: "KienlongBank" },
  { code: "LPB", name: "LPBank" },
  { code: "MBB", name: "MB Bank" },
  { code: "MSB", name: "MSB" },
  { code: "NAB", name: "Nam A Bank" },
  { code: "OCB", name: "OCB" },
  { code: "PGB", name: "PGBank" },
  { code: "PVCB", name: "PVcomBank" },
  { code: "SCB", name: "SCB" },
  { code: "SCVN", name: "Standard Chartered Vietnam" },
  { code: "SEAB", name: "SeABank" },
  { code: "SGB", name: "Saigonbank" },
  { code: "SHB", name: "SHB" },
  { code: "SHINHAN", name: "Shinhan Bank" },
  { code: "STB", name: "Sacombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "TIMO", name: "Timo" },
  { code: "TIMI", name: "Timi Bank" },
  { code: "TPB", name: "TPBank" },
  { code: "UBANK", name: "Ubank by VPBank" },
  { code: "UOB", name: "UOB Vietnam" },
  { code: "VAB", name: "Viet A Bank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "VIB", name: "VIB" },
  { code: "WOORI", name: "Woori Bank Vietnam" },
];

const tips = [
  { icon: Shield, text: "Kiểm tra kỹ số tài khoản trước khi chuyển" },
  { icon: Lock, text: "Không chuyển tiền cho người lạ qua mạng xã hội" },
  { icon: Sparkles, text: "AI sẽ quét tự động trước mỗi giao dịch" },
];

const amountInputFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

function normalizeAmountInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

export default function TransferPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const fetchMe = useAuthStore((state) => state.fetchMe);
  const dailySummaryQuery = useQuery({
    queryKey: ["transaction-history-summary"],
    queryFn: () => transactionsApi.getHistorySummary(),
    staleTime: 30_000,
  });
  const dailyTransferLimit = 100_000_000;
  const completedToday = dailySummaryQuery.data?.completed_outgoing_today ?? 0;
  const remainingDailyLimit = Math.max(0, dailyTransferLimit - completedToday);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  const [step, setStep] = useState<
    "form" | "review" | "ai-check" | "pin" | "face" | "success"
  >("form");
  const [pin, setPin] = useState("");
  const [form, setForm] = useState<TransferForm>({
    recipient_account: "",
    recipient_name: "",
    recipient_lookup_token: "",
    bank_code: "",
    amount: "",
    note: "",
  });
  const [riskData, setRiskData] = useState<RiskAssessment | null>(null);
  const [txId, setTxId] = useState<string>("");
  const [recipientLookupState, setRecipientLookupState] =
    useState<RecipientLookupState>({ status: "idle" });
  const [isBankPickerOpen, setBankPickerOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const selectedBank = banks.find((bank) => bank.code === form.bank_code);
  const normalizedBankSearch = bankSearch.trim().toLocaleLowerCase("vi-VN");
  const filteredBanks = banks.filter((bank) =>
    `${bank.name} ${bank.code}`
      .toLocaleLowerCase("vi-VN")
      .includes(normalizedBankSearch),
  );

  useEffect(() => {
    const payment = (
      location.state as {
        QrPayment?: Partial<{
          accountNumber: string;
          bankCode: string;
          amount: number;
          note: string;
        }>;
      } | null
    )?.QrPayment;
    if (
      !payment ||
      typeof payment.accountNumber !== "string" ||
      typeof payment.bankCode !== "string"
    )
      return;

    const bankCode = payment.bankCode;
    const accountNumber = payment.accountNumber.replace(/\s+/g, "");
    const isKnownBank = banks.some((bank) => bank.code === bankCode);
    if (!/^\d{6,19}$/.test(accountNumber) || !isKnownBank) return;

    setForm((current) => ({
      ...current,
      recipient_account: accountNumber,
      bank_code: bankCode,
      // A QR value is not trusted as a recipient identity. The existing lookup
      // effect below will obtain a fresh name and signed verification token.
      recipient_name: "",
      recipient_lookup_token: "",
      ...(Number.isSafeInteger(payment.amount) && payment.amount! > 0
        ? { amount: String(payment.amount) }
        : {}),
      ...(typeof payment.note === "string" && payment.note.length <= 500
        ? { note: payment.note }
        : {}),
    }));
    setBankSearch(banks.find((bank) => bank.code === bankCode)?.name ?? "");
    setRecipientLookupState({ status: "idle" });
    navigate("/transfer", { replace: true, state: null });
  }, [location.state, navigate]);

  const decisionMutation = useMutation({
    mutationFn: async ({
      transactionId,
      decision,
      verified = false,
      pin: transactionPin,
      faceVerified = false,
      verificationMethod,
      faceVerificationToken,
    }: {
      transactionId: string;
      decision: "proceeded" | "cancelled";
      verified?: boolean;
      pin?: string;
      faceVerified?: boolean;
      verificationMethod?: string;
      faceVerificationToken?: string;
    }) =>
      transactionsApi.decide(transactionId, decision, {
        verificationConfirmed: verified,
        verificationMethod: verificationMethod ?? (verified
          ? "user_confirmed_independent_check"
          : undefined),
        pin: transactionPin,
        faceVerificationConfirmed: faceVerified,
        faceVerificationToken,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history-summary"] });
      void fetchMe();
      if (data.transaction_status === "completed") setStep("success");
      else if (data.transaction_status === "cancelled") {
        setStep("review");
        setRiskData(null);
      }
    },
    onError: (err: any) =>
      alert(
        err.response?.data?.detail || "Không thể ghi nhận quyết định giao dịch",
      ),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: TransferForm) =>
      transactionsApi.assess({
        payee_account: data.recipient_account,
        bank_code: data.bank_code,
        recipient_lookup_token: data.recipient_lookup_token,
        amount: Math.round(Number(data.amount)),
        note: data.note || undefined,
        currency: "VND",
        client_context: await collectRiskClientContext(),
      }),
    onSuccess: (data) => {
      setTxId(data.transaction_id);
      setRiskData(data);
      if (data.should_warn && data.warning) {
        setStep("ai-check");
        return;
      }
      setStep(data.requires_face_verification ? "face" : "pin");
    },
    onError: (err: any) =>
      alert(err.response?.data?.detail || "Có lỗi xảy ra khi phân tích rủi ro"),
  });

  useEffect(() => {
    const accountNumber = form.recipient_account.replace(/\s/g, "");
    if (!form.bank_code || !accountNumber) {
      setRecipientLookupState({ status: "idle" });
      return;
    }
    if (!/^\d{6,19}$/.test(accountNumber)) {
      setRecipientLookupState({
        status: "idle",
        message: "Số tài khoản cần từ 6 đến 19 chữ số",
      });
      return;
    }
    if (form.bank_code === "TIMI" && !/^\d{10}$/.test(accountNumber)) {
      setRecipientLookupState({
        status: "idle",
        message: "Số tài khoản Timi Bank chính là số điện thoại gồm đúng 10 chữ số.",
      });
      return;
    }

    let cancelled = false;
    setRecipientLookupState({ status: "loading" });
    const timeoutId = window.setTimeout(() => {
      void transactionsApi
        .lookupRecipient({
          account_number: accountNumber,
          bank_code: form.bank_code,
        })
        .then((result) => {
          if (cancelled) return;
          setForm((current) =>
            current.recipient_account.replace(/\s/g, "") === accountNumber &&
            current.bank_code === form.bank_code
              ? {
                  ...current,
                  recipient_name: result.account_name,
                  recipient_lookup_token: result.verification_token,
                }
              : current,
          );
          setRecipientLookupState({ status: "success" });
        })
        .catch((error: any) => {
          if (cancelled) return;
          setRecipientLookupState({
            status: "error",
            message:
              error.response?.data?.detail ||
              "Không thể tra cứu tên tài khoản. Vui lòng thử lại.",
          });
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.recipient_account, form.bank_code]);

  const handleAccountChange = (recipient_account: string) => {
    setForm((current) => ({
      ...current,
      recipient_account: recipient_account.replace(/\D/g, "").slice(0, 19),
      recipient_name: "",
      recipient_lookup_token: "",
    }));
  };

  const handleBankChange = (bank_code: string) => {
    setForm((current) => ({
      ...current,
      bank_code,
      recipient_name: "",
      recipient_lookup_token: "",
    }));
    setBankSearch(banks.find((bank) => bank.code === bank_code)?.name ?? "");
    setBankPickerOpen(false);
  };

  const handleBankSearchChange = (value: string) => {
    setBankSearch(value);
    setBankPickerOpen(true);
    if (form.bank_code) {
      setForm((current) => ({
        ...current,
        bank_code: "",
        recipient_name: "",
        recipient_lookup_token: "",
      }));
    }
  };

  const handleBankFocus = () => {
    setBankPickerOpen(true);
    if (form.bank_code) {
      setBankSearch("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setStep("review");
  };
  const handleRiskCheck = () => analyzeMutation.mutate(form);
  const handleProceed = (transactionPin: string) => {
    if (!txId) return;
    if (requiresFaceVerification) {
      setStep("face");
      return;
    }
    decisionMutation.mutate({
      transactionId: txId,
      decision: "proceeded",
      verified: true,
      pin: transactionPin,
    });
  };
  const handleFaceVerified = async (imageData: string) => {
    if (!txId) throw new Error("Không tìm thấy giao dịch cần xác thực");
    const result = await authApi.verifyFace(imageData, txId);
    if (!result.matched || !result.verification_token) return result;
    decisionMutation.mutate({
      transactionId: txId,
      decision: "proceeded",
      verified: true,
      faceVerified: true,
      verificationMethod: "face_liveness_camera",
      faceVerificationToken: result.verification_token,
    });
    return result;
  };
  const handleCancel = () => {
    if (!txId) return;
    decisionMutation.mutate({ transactionId: txId, decision: "cancelled" });
  };
  const formatMoney = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return "0 đ";
    return new Intl.NumberFormat("vi-VN").format(num) + " đ";
  };
  const isFormValid = Boolean(
    form.recipient_account &&
    form.recipient_name &&
    form.recipient_lookup_token &&
    form.amount &&
    form.bank_code,
  );
  const requiresFaceVerification = Boolean(riskData?.requires_face_verification);

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
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-800">Chuyển tiền</h1>
          </div>

          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
            <div className="grid lg:grid-cols-12 gap-6">
              {/* Left Decorative Sidebar */}
              <div className="hidden xl:block lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Mẹo bảo mật
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {tips.map((tip, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50/80"
                      >
                        <tip.icon className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {tip.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-5 text-white shadow-lg shadow-rose-200 relative overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-16 h-16 bg-white/10 rounded-full" />
                  <Heart className="w-5 h-5 text-white/40 mb-2" />
                  <p className="text-xs font-bold mb-1">Timi bảo vệ bạn</p>
                  <p className="text-[10px] text-rose-100">
                    Đã chặn 1.2K giao dịch lừa đảo tháng này
                  </p>
                </div>
              </div>

              {/* Main Form */}
              <div className="lg:col-span-7 xl:col-span-7 space-y-5">
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 relative overflow-visible">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="relative">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                      Thông tin người nhận
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <label className="text-sm font-medium text-gray-700">
                            Số tài khoản
                          </label>
                          <button
                            type="button"
                            onClick={() => navigate("/qr?mode=scan")}
                            className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                          >
                            <QrCode className="w-4 h-4" />
                            Quét QR
                          </button>
                        </div>
                        <div className="relative">
                          <CreditCard className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Nhập số tài khoản"
                            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none transition-shadow"
                            value={form.recipient_account}
                            onChange={(e) =>
                              handleAccountChange(e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                          Tên chủ tài khoản
                        </label>
                        <div className="relative min-h-11 flex items-center pl-11 pr-10 py-2.5 bg-gray-50 rounded-xl text-gray-800">
                          <User className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          {recipientLookupState.status === "loading" ? (
                            <span className="flex items-center gap-2 text-sm text-gray-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Đang tra cứu dữ liệu nội bộ...
                            </span>
                          ) : form.recipient_name ? (
                            <span className="font-semibold text-sm">
                              {form.recipient_name}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">
                              Tên tài khoản
                            </span>
                          )}
                          {recipientLookupState.status === "success" && (
                            <CheckCircle2 className="absolute right-3.5 w-5 h-5 text-emerald-500" />
                          )}
                        </div>
                        {recipientLookupState.status === "error" && (
                          <p className="mt-1.5 text-xs text-rose-600">
                            {recipientLookupState.message}
                          </p>
                        )}
                        {recipientLookupState.status === "idle" &&
                          recipientLookupState.message && (
                            <p className="mt-1.5 text-xs text-gray-500">
                              {recipientLookupState.message}
                            </p>
                          )}
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                          Ngân hàng
                        </label>
                        <div className="relative">
                          <Building2 className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls="recipient-bank-options"
                            aria-expanded={isBankPickerOpen}
                            placeholder="Nhập tên hoặc mã ngân hàng"
                            className="w-full pl-11 pr-10 py-2.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none transition-shadow"
                            value={
                              isBankPickerOpen || !form.bank_code
                                ? bankSearch
                                : (selectedBank?.name ?? "")
                            }
                            onFocus={handleBankFocus}
                            onBlur={() => setBankPickerOpen(false)}
                            onChange={(e) =>
                              handleBankSearchChange(e.target.value)
                            }
                          />
                          <ChevronRight className="absolute right-3.5 top-3 w-5 h-5 text-gray-400 rotate-90 pointer-events-none" />
                          {isBankPickerOpen && (
                            <div
                              id="recipient-bank-options"
                              role="listbox"
                              className="absolute left-0 top-full z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
                            >
                              {filteredBanks.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-gray-500">
                                  Không tìm thấy ngân hàng phù hợp.
                                </p>
                              ) : (
                                filteredBanks.map((bank) => (
                                  <button
                                    key={bank.code}
                                    type="button"
                                    role="option"
                                    aria-selected={bank.code === form.bank_code}
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      handleBankChange(bank.code);
                                    }}
                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-rose-50"
                                  >
                                    <span className="font-medium text-gray-800">
                                      {bank.name}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-400">
                                      {bank.code}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 relative overflow-hidden">
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-50 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative">
                    <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                      Số tiền
                    </h2>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label="Số tiền chuyển"
                        placeholder="0"
                        className="w-full pr-16 text-3xl sm:text-4xl font-bold tabular-nums text-gray-800 bg-transparent border-0 focus:ring-0 outline-none placeholder-gray-300"
                        value={
                          form.amount
                            ? amountInputFormatter.format(Number(form.amount))
                            : ""
                        }
                        onChange={(e) => {
                          const amount = normalizeAmountInput(e.target.value);
                          setForm((current) => ({ ...current, amount }));
                        }}
                      />
                      <span className="absolute right-0 top-2 text-lg text-gray-500 font-semibold">
                        VND
                      </span>
                    </div>
                    <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
                      {["50000", "100000", "200000", "500000", "1000000"].map(
                        (amount) => (
                          <button
                            key={amount}
                            onClick={() => setForm({ ...form, amount })}
                            className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-600 hover:bg-rose-100 hover:text-rose-600 transition-colors whitespace-nowrap"
                          >
                            {new Intl.NumberFormat("vi-VN").format(
                              parseInt(amount),
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">
                    Nội dung chuyển tiền
                  </label>
                  <textarea
                    placeholder="Nhập nội dung (không bắt buộc)"
                    className="w-full p-3.5 bg-gray-50 rounded-xl border-0 text-gray-800 focus:ring-2 focus:ring-rose-500 outline-none resize-none transition-shadow"
                    rows={2}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid}
                  className="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Tiếp tục
                </button>
              </div>

              {/* Right Sidebar */}
              <div className="hidden lg:block lg:col-span-3 space-y-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-24">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                    Tóm tắt
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Số dư khả dụng</p>
                        <p className="font-bold text-gray-900">
                          {new Intl.NumberFormat("vi-VN").format(user?.balance ?? 0)} đ
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Banknote className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Hạn mức còn lại</p>
                        <p className="font-bold text-gray-900">
                          {new Intl.NumberFormat("vi-VN").format(remainingDailyLimit)} đ
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-500" />
                      <p className="text-xs font-semibold text-emerald-700">
                        AI Anti-Scam đang bảo vệ
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-200 relative overflow-hidden">
                  <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
                  <Star className="w-5 h-5 text-white/40 mb-2" />
                  <p className="text-xs font-bold mb-1">Ưu đãi chuyển tiền</p>
                  <p className="text-[10px] text-violet-100">
                    Miễn phí chuyển tiền đến 20 ngân hàng
                  </p>
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
            <button
              onClick={() => setStep("form")}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-800">
              Xác nhận giao dịch
            </h1>
          </div>
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
            <div className="grid lg:grid-cols-12 gap-6">
              <div className="hidden xl:block lg:col-span-3" />
              <div className="lg:col-span-6">
                <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="relative">
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-500 text-sm">Người nhận</span>
                      <span className="font-bold text-gray-900">
                        {form.recipient_name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-500 text-sm">
                        Số tài khoản
                      </span>
                      <span className="font-bold text-gray-900 font-mono">
                        {form.recipient_account}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-500 text-sm">Ngân hàng</span>
                      <span className="font-bold text-gray-900">
                        {banks.find((b) => b.code === form.bank_code)?.name ||
                          form.bank_code}
                      </span>
                    </div>
                    <hr className="border-gray-100" />
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-500 text-sm">Số tiền</span>
                      <span className="text-2xl font-bold text-rose-600">
                        {formatMoney(form.amount)}
                      </span>
                    </div>
                    {form.note && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-500 text-sm">Nội dung</span>
                        <span className="text-gray-800 text-right max-w-[60%] font-medium">
                          {form.note}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleRiskCheck}
                  disabled={analyzeMutation.isPending}
                  className="w-full mt-5 py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
              <div className="hidden xl:block lg:col-span-3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "ai-check" && riskData) {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center p-4 relative overflow-visible">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-gradient-to-br from-rose-200/30 to-pink-200/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-gradient-to-br from-amber-200/25 to-orange-200/15 rounded-full blur-3xl" />
        </div>
        <AIRiskModal
          riskData={riskData}
          onProceed={handleProceed}
          onCancel={handleCancel}
          isLoading={decisionMutation.isPending}
          requiresFaceVerification={requiresFaceVerification}
        />
      </div>
    );
  }

  if (step === "face") {
    return <FaceVerificationModal onVerified={handleFaceVerified} onCancel={handleCancel} onSetupFace={() => navigate("/setup-face")} isLoading={decisionMutation.isPending} />;
  }

  if (step === "pin") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
            <Lock className="h-8 w-8 text-rose-600" />
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-800">
            Xác nhận mã PIN
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500">
            Kiểm tra rủi ro đã hoàn tất. Nhập PIN giao dịch để tiếp tục.
          </p>
          <input
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            type="password"
            autoComplete="off"
            placeholder="PIN 4–6 chữ số"
            className="mt-6 w-full rounded-xl border border-rose-200 p-4 text-center text-xl tracking-[0.5em] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-300"
          />
          <button
            disabled={!/^\d{4,6}$/.test(pin) || decisionMutation.isPending}
            onClick={() =>
              decisionMutation.mutate({
                transactionId: txId,
                decision: "proceeded",
                pin,
              })
            }
            className="mt-4 w-full rounded-xl bg-rose-600 py-3 font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
          >
            {decisionMutation.isPending
              ? "Đang xử lý..."
              : "Xác nhận chuyển tiền"}
          </button>
          <button
            onClick={handleCancel}
            disabled={decisionMutation.isPending}
            className="mt-2 w-full rounded-xl bg-gray-100 py-3 font-medium text-gray-700"
          >
            Hủy giao dịch
          </button>
        </div>
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
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Chuyển tiền thành công!
          </h2>
          <p className="text-gray-500 mb-6">
            {formatMoney(form.amount)} đã được chuyển đến {form.recipient_name}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate("/history")}
              className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              Xem lịch sử
            </button>
            <button
              onClick={() => {
                setStep("form");
                setForm({
                  recipient_account: "",
                  recipient_name: "",
                  recipient_lookup_token: "",
                  bank_code: "",
                  amount: "",
                  note: "",
                });
                setBankSearch("");
                setBankPickerOpen(false);
                setRecipientLookupState({ status: "idle" });
                setRiskData(null);
                setTxId("");
              }}
              className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
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
