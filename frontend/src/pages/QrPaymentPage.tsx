import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  ImageUp,
  Loader2,
  QrCode,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  createDemoPaymentQr,
  parseDemoPaymentQr,
  paymentBanks,
  type PaymentQrData,
} from "@/lib/paymentQr";
import { transactionsApi } from "@/api/transactions";

const CAMERA_READER_ID = "timi-demo-qr-camera";

type Mode = "scan" | "create";
type ScannerState = "idle" | "starting" | "scanning";
type RecipientLookupState =
  | { status: "idle"; message?: string }
  | { status: "loading" }
  | { status: "success"; accountName: string }
  | { status: "error"; message: string };

const formatMoney = (amount?: number) => (
  amount ? `${new Intl.NumberFormat("vi-VN").format(amount)} đ` : "Không cố định"
);

function cameraErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (name || message) return [name, message].filter(Boolean).join(": ");
  }
  return "Không rõ nguyên nhân";
}

function getInitialMode(search: string): Mode {
  return new URLSearchParams(search).get("mode") === "scan" ? "scan" : "create";
}

export default function QrPaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>(() => getInitialMode(location.search));
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [scanError, setScanError] = useState("");
  const [form, setForm] = useState({
    accountNumber: "",
    bankCode: "",
    amount: "",
    note: "",
    accountName: "",
  });
  const [recipientLookupState, setRecipientLookupState] = useState<RecipientLookupState>({ status: "idle" });
  const [generatedQr, setGeneratedQr] = useState<{ image: string; payload: string; payment: PaymentQrData } | null>(null);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // stop() rejects when the camera has not started yet; clear still removes its DOM nodes.
    }
    try {
      await scanner.clear();
    } catch {
      // The reader may already have been removed while navigating away.
    }
  }, []);

  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  useEffect(() => {
    const accountNumber = form.accountNumber.replace(/\s+/g, "");
    if (!form.bankCode || !accountNumber) {
      setRecipientLookupState({ status: "idle" });
      return;
    }
    if (!/^\d{6,19}$/.test(accountNumber)) {
      setRecipientLookupState({ status: "idle", message: "Số tài khoản cần từ 6 đến 19 chữ số." });
      return;
    }

    let cancelled = false;
    setRecipientLookupState({ status: "loading" });
    const timeoutId = window.setTimeout(() => {
      void transactionsApi.lookupRecipient({ account_number: accountNumber, bank_code: form.bankCode })
        .then((recipient) => {
          if (cancelled) return;
          setForm((current) => (
            current.accountNumber.replace(/\s+/g, "") === accountNumber && current.bankCode === form.bankCode
              ? { ...current, accountName: recipient.account_name }
              : current
          ));
          setRecipientLookupState({ status: "success", accountName: recipient.account_name });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const detail = typeof error === "object" && error !== null && "response" in error
            ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
          setForm((current) => (
            current.accountNumber.replace(/\s+/g, "") === accountNumber && current.bankCode === form.bankCode
              ? { ...current, accountName: "" }
              : current
          ));
          setRecipientLookupState({ status: "error", message: detail || "Không thể xác minh tên chủ tài khoản. Vui lòng kiểm tra lại." });
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [form.accountNumber, form.bankCode]);

  const switchMode = async (nextMode: Mode) => {
    await stopScanner();
    setScannerState("idle");
    setScanError("");
    setMode(nextMode);
  };

  const handleDecodedText = useCallback((decodedText: string) => {
    const payment = parseDemoPaymentQr(decodedText);
    if (!payment) {
      // The scanner did decode a QR. It is intentionally not used as transfer
      // data because only the app's demo payload has a defined, validated shape.
      setScanError("Đã đọc được mã QR, nhưng đây không phải QR demo của Timi. Hãy quét mã được tạo từ mục “Tạo QR”.");
      return false;
    }
    setScanError("");
    setScannerState("idle");
    void stopScanner();
    // A successful demo QR goes straight to the transfer form. The transfer
    // page deliberately performs a fresh recipient lookup before it can send.
    navigate("/transfer", { state: { demoQrPayment: payment } });
    return true;
  }, [navigate, stopScanner]);

  const startScanner = async () => {
    if (scannerRef.current) return;
    setScanError("");
    setScannerState("starting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt hoặc địa chỉ hiện tại không hỗ trợ truy cập camera.");
      }
      let scanner = new Html5Qrcode(CAMERA_READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      const scanConfig = { fps: 10, qrbox: { width: 240, height: 240 } };
      try {
        // On mobile this normally selects the rear camera without requiring a
        // device-specific id.
        await scanner.start({ facingMode: { ideal: "environment" } }, scanConfig, handleDecodedText, () => undefined);
      } catch (preferredCameraError) {
        // Some desktop browsers reject facingMode constraints even though a
        // permitted camera exists. Do not reuse the failed scanner here: its
        // internal state may still be transitioning after start() rejects.
        scannerRef.current = null;
        try {
          scanner.clear();
        } catch {
          // The failed scanner may not have rendered a reader yet.
        }
        const cameras = await Html5Qrcode.getCameras();
        const preferredCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[0];
        if (!preferredCamera) throw preferredCameraError;
        scanner = new Html5Qrcode(CAMERA_READER_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(preferredCamera.id, scanConfig, handleDecodedText, () => undefined);
      }
      setScannerState("scanning");
    } catch (error) {
      const failedScanner = scannerRef.current;
      scannerRef.current = null;
      try {
        failedScanner?.clear();
      } catch {
        // The reader may not have rendered yet.
      }
      setScannerState("idle");
      const message = cameraErrorMessage(error);
      const secureContextHint = window.isSecureContext
        ? "Hãy cấp quyền camera cho trình duyệt rồi thử lại."
        : "Camera chỉ hoạt động trên HTTPS hoặc localhost. Khi mở bằng IP mạng nội bộ, hãy dùng HTTPS hoặc tải ảnh QR bên dưới.";
      setScanError(`Không thể mở camera. ${secureContextHint} (${message})`);
    }
  };

  const scanImageFile = async (file: File) => {
    await stopScanner();
    setScanError("");
    setScannerState("starting");
    try {
      const scanner = new Html5Qrcode(CAMERA_READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      handleDecodedText(decodedText);
    } catch {
      setScanError("Không thể đọc QR từ ảnh này. Hãy dùng ảnh rõ nét, không bị cắt mất viền QR.");
    } finally {
      setScannerState("idle");
      await stopScanner();
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError("");
    if (recipientLookupState.status !== "success") {
      setCreateError("Cần xác minh số tài khoản và ngân hàng trước khi tạo QR demo.");
      return;
    }
    const amount = form.amount.trim() ? Number(form.amount) : undefined;
    const payment: PaymentQrData = {
      accountNumber: form.accountNumber,
      bankCode: form.bankCode,
      ...(amount ? { amount } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      accountName: recipientLookupState.accountName,
    };
    const payload = createDemoPaymentQr(payment);
    if (!payload) {
      setCreateError("Kiểm tra lại ngân hàng, số tài khoản (6–19 chữ số), số tiền và nội dung.");
      return;
    }

    setIsCreating(true);
    try {
      const image = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 440,
        color: { dark: "#171717", light: "#FFFFFF" },
      });
      setGeneratedQr({ image, payload, payment });
    } catch {
      setCreateError("Không thể tạo hình QR. Vui lòng thử lại.");
    } finally {
      setIsCreating(false);
    }
  };

  const downloadQr = () => {
    if (!generatedQr) return;
    const link = document.createElement("a");
    link.href = generatedQr.image;
    link.download = "timi-qr-thanh-toan-demo.png";
    link.click();
  };

  const verifiedRecipientName = recipientLookupState.status === "success" ? recipientLookupState.accountName : "";

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Quay lại trang chủ">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">QR thanh toán demo</h1>
          <p className="text-xs text-gray-500">Quét hoặc tạo mã cho luồng mô phỏng của Timi</p>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 text-amber-800">
          <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed"><strong>Chỉ dùng để demo.</strong> Mã QR này không kết nối ngân hàng và không thể thực hiện thanh toán ngoài đời thực.</p>
        </div>

        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <section className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100 shadow-sm">
            <div className="flex rounded-xl bg-gray-100 p-1 mb-6" role="tablist" aria-label="Chức năng QR">
              <button type="button" role="tab" aria-selected={mode === "scan"} onClick={() => void switchMode("scan")} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${mode === "scan" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"}`}>
                <span className="flex items-center justify-center gap-2"><ScanLine className="w-4 h-4" />Quét QR</span>
              </button>
              <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => void switchMode("create")} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${mode === "create" ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"}`}>
                <span className="flex items-center justify-center gap-2"><QrCode className="w-4 h-4" />Tạo QR</span>
              </button>
            </div>

            {mode === "scan" ? (
              <div>
                <h2 className="text-xl font-bold text-gray-900">Quét QR bằng camera</h2>
                <p className="mt-1 text-sm text-gray-500">Hướng camera vào QR demo được tạo từ Timi.</p>
                <div className="relative mt-5 overflow-hidden rounded-2xl bg-gray-950 aspect-square grid place-items-center">
                  <div id={CAMERA_READER_ID} className="w-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
                  {scannerState !== "scanning" && (
                    <div className="absolute text-center text-white px-6">
                      <Camera className="w-10 h-10 mx-auto mb-3 text-rose-300" />
                      <p className="text-sm text-gray-200">Camera chỉ được mở khi bạn bấm nút bên dưới.</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex gap-3">
                  {scannerState === "scanning" ? (
                    <button type="button" onClick={() => { void stopScanner(); setScannerState("idle"); }} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 flex items-center justify-center gap-2">
                      <X className="w-5 h-5" />Tắt camera
                    </button>
                  ) : (
                    <button type="button" onClick={() => void startScanner()} disabled={scannerState === "starting"} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                      {scannerState === "starting" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                      {scannerState === "starting" ? "Đang mở camera..." : "Mở camera"}
                    </button>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={scannerState === "starting"} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 disabled:opacity-60 flex items-center justify-center gap-2">
                    <ImageUp className="w-5 h-5" />Quét từ ảnh
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void scanImageFile(file);
                }} />
                {scanError && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{scanError}</p>}
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Tạo QR nhận tiền demo</h2>
                  <p className="mt-1 text-sm text-gray-500">Chọn thông tin sẽ được điền khi người khác quét mã.</p>
                </div>
                <label className="block text-sm font-semibold text-gray-700">Ngân hàng
                  <select required value={form.bankCode} onChange={(event) => {
                    setForm((current) => ({ ...current, bankCode: event.target.value, accountName: "" }));
                    setRecipientLookupState({ status: "idle" });
                  }} className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none ring-0 focus:ring-2 focus:ring-rose-500">
                    <option value="">Chọn ngân hàng</option>
                    {paymentBanks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-gray-700">Số tài khoản
                  <input required inputMode="numeric" maxLength={19} value={form.accountNumber} onChange={(event) => {
                    setForm((current) => ({ ...current, accountNumber: event.target.value.replace(/\D/g, ""), accountName: "" }));
                    setRecipientLookupState({ status: "idle" });
                  }} placeholder="Nhập 6–19 chữ số" className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                </label>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Tên chủ tài khoản</p>
                  <div className="mt-1.5 min-h-11 rounded-xl bg-gray-50 px-3 py-2.5 flex items-center text-sm">
                    {recipientLookupState.status === "loading" ? (
                      <span className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Đang đối chiếu tài khoản...</span>
                    ) : verifiedRecipientName ? (
                      <span className="flex items-center gap-2 font-bold text-gray-800"><CheckCircle2 className="w-4 h-4 text-emerald-500" />{verifiedRecipientName}</span>
                    ) : (
                      <span className="text-gray-400">Sẽ hiện sau khi đối chiếu</span>
                    )}
                  </div>
                  {recipientLookupState.status === "error" && <p className="mt-1.5 text-xs text-rose-600">{recipientLookupState.message}</p>}
                  {recipientLookupState.status === "idle" && recipientLookupState.message && <p className="mt-1.5 text-xs text-gray-500">{recipientLookupState.message}</p>}
                </div>
                <label className="block text-sm font-semibold text-gray-700">Số tiền <span className="font-normal text-gray-400">(tùy chọn)</span>
                  <input inputMode="numeric" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, "") })} placeholder="Để trống nếu người quét tự nhập" className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                </label>
                <label className="block text-sm font-semibold text-gray-700">Nội dung <span className="font-normal text-gray-400">(tùy chọn)</span>
                  <input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Ví dụ: Thanh toán đơn hàng" className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                </label>
                {createError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>}
                <button disabled={isCreating || recipientLookupState.status !== "success"} className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                  {isCreating ? "Đang tạo QR..." : "Tạo QR demo"}
                </button>
              </form>
            )}
          </section>

          <section className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100 shadow-sm flex flex-col">
            {mode === "create" && generatedQr ? (
              <div className="h-full flex flex-col items-center text-center">
                <div className="flex items-center gap-2 text-emerald-600 self-start"><CheckCircle2 className="w-6 h-6" /><span className="font-bold">QR demo đã sẵn sàng</span></div>
                <img src={generatedQr.image} alt="Mã QR thanh toán demo Timi" className="mt-5 w-full max-w-[340px] rounded-2xl border border-gray-100" />
                <PaymentSummary payment={generatedQr.payment} compact />
                <button type="button" onClick={downloadQr} className="mt-auto pt-6 w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 flex items-center justify-center gap-2"><Download className="w-5 h-5" />Tải ảnh QR</button>
              </div>
            ) : (
              <div className="h-full min-h-[440px] grid place-items-center text-center px-6">
                <div>
                  <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-rose-50"><QrCode className="w-8 h-8 text-rose-500" /></div>
                  <h2 className="mt-5 text-xl font-bold text-gray-900">{mode === "scan" ? "Sẵn sàng quét QR" : "QR demo sẽ hiển thị ở đây"}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{mode === "scan" ? "Mở camera, đưa QR demo vào khung và xác nhận lại thông tin trước khi chuyển tiền." : "Điền thông tin người nhận để tạo một mã dùng trong luồng demo Timi."}</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function PaymentSummary({ payment, compact = false }: { payment: PaymentQrData; compact?: boolean }) {
  const bank = payment.bankName ?? paymentBanks.find((item) => item.code === payment.bankCode)?.name ?? payment.bankCode;
  return (
    <div className={`w-full mt-5 rounded-2xl bg-gray-50 text-left ${compact ? "p-4" : "p-5"}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Thông tin nhận tiền</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4"><span className="text-gray-500">Ngân hàng</span><span className="font-semibold text-gray-800 text-right">{bank}</span></div>
        <div className="flex justify-between gap-4"><span className="text-gray-500">Số tài khoản</span><span className="font-mono font-bold text-gray-900 text-right">{payment.accountNumber}</span></div>
        {payment.accountName && <div className="flex justify-between gap-4"><span className="text-gray-500">Người nhận</span><span className="font-semibold text-gray-800 text-right">{payment.accountName}</span></div>}
        <div className="flex justify-between gap-4"><span className="text-gray-500">Số tiền</span><span className="font-bold text-rose-600 text-right">{formatMoney(payment.amount)}</span></div>
        {payment.note && <div className="flex justify-between gap-4"><span className="text-gray-500">Nội dung</span><span className="font-medium text-gray-800 text-right break-words">{payment.note}</span></div>}
      </div>
    </div>
  );
}
