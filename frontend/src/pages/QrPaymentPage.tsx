import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImageUp,
  Link2,
  Loader2,
  QrCode,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  X,
} from "lucide-react";

import {
  createPaymentQr,
  parseQrContent,
  paymentBanks,
  type DecodedQrContent,
  type PaymentQrData,
} from "@/lib/paymentQr";
import { urlSafetyApi } from "@/api/urlSafety";
import { useAuthStore } from "@/stores/authStore";

const CAMERA_READER_ID = "timi-qr-camera";

type Mode = "scan" | "create";
type ScannerState = "idle" | "starting" | "scanning";
type UrlSafetyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "clear"; hostname: string | null }
  | { status: "blocked"; hostname: string | null; reason: string }
  | { status: "unavailable" };

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
  const user = useAuthStore((state) => state.user);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlSafetyRequestRef = useRef(0);
  const [mode, setMode] = useState<Mode>(() => getInitialMode(location.search));
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [scanError, setScanError] = useState("");
  const [decodedContent, setDecodedContent] = useState<DecodedQrContent | null>(null);
  const [urlSafetyState, setUrlSafetyState] = useState<UrlSafetyState>({ status: "idle" });
  const [form, setForm] = useState({
    amount: "",
    note: "",
  });
  const [generatedQr, setGeneratedQr] = useState<{ image: string; payload: string; payment: PaymentQrData } | null>(null);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const ownAccountNumber = user?.phone?.trim() ?? "";
  const ownAccountName = user?.full_name.trim() ?? "";
  const canCreateOwnQr = Boolean(
    user?.timi_bank_enabled
    && /^\d{10}$/.test(ownAccountNumber)
    && ownAccountName,
  );

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

  const resetUrlSafety = useCallback(() => {
    urlSafetyRequestRef.current += 1;
    setUrlSafetyState({ status: "idle" });
  }, []);

  const checkUrlSafety = useCallback(async (url: string) => {
    const requestId = urlSafetyRequestRef.current + 1;
    urlSafetyRequestRef.current = requestId;
    setUrlSafetyState({ status: "checking" });

    try {
      const result = await urlSafetyApi.check(url);
      if (requestId !== urlSafetyRequestRef.current) return;
      setUrlSafetyState(result.blocked
        ? {
            status: "blocked",
            hostname: result.hostname,
            reason: result.reason ?? "Tên miền này nằm trong blacklist URL lừa đảo.",
          }
        : { status: "clear", hostname: result.hostname });
    } catch {
      if (requestId === urlSafetyRequestRef.current) {
        // A link must not become openable merely because the safety service is
        // unavailable or the user's session has expired.
        setUrlSafetyState({ status: "unavailable" });
      }
    }
  }, []);

  const switchMode = async (nextMode: Mode) => {
    await stopScanner();
    setScannerState("idle");
    setScanError("");
    setDecodedContent(null);
    resetUrlSafety();
    setMode(nextMode);
  };

  const handleDecodedText = useCallback((decodedText: string) => {
    const content = parseQrContent(decodedText);
    setScanError("");
    setScannerState("idle");
    void stopScanner();

    if (content.kind === "payment") {
      resetUrlSafety();
      // A successful payment QR goes straight to the transfer form. The
      // transfer page deliberately performs a fresh recipient lookup first.
      navigate("/transfer", { state: { QrPayment: content.payment } });
      return true;
    }

    // Never open URLs, call phone numbers, or join Wi-Fi automatically. The
    // result panel makes the scanned content and link risk signals explicit.
    setDecodedContent(content);
    if (content.kind === "url" && content.normalizedUrl) {
      void checkUrlSafety(content.normalizedUrl);
    } else {
      resetUrlSafety();
    }
    return true;
  }, [checkUrlSafety, navigate, resetUrlSafety, stopScanner]);

  const startScanner = async () => {
    if (scannerRef.current) return;
    setScanError("");
    setDecodedContent(null);
    resetUrlSafety();
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
    setDecodedContent(null);
    resetUrlSafety();
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
    if (!canCreateOwnQr) {
      setCreateError("Tài khoản Timi Bank chưa sẵn sàng. Hãy cập nhật số điện thoại gồm đúng 10 chữ số trong hồ sơ.");
      return;
    }
    const amount = form.amount.trim() ? Number(form.amount) : undefined;
    const payment: PaymentQrData = {
      accountNumber: ownAccountNumber,
      bankCode: "TIMI",
      ...(amount ? { amount } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      accountName: ownAccountName,
    };
    const payload = createPaymentQr(payment);
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
    link.download = "timi-qr-thanh-toan-.png";
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      <header className="bg-white border-b border-gray-100 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate("/dashboard")} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Quay lại trang chủ">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-800">QR thanh toán </h1>
          <p className="text-xs text-gray-500">Quét hoặc tạo mã cho luồng mô phỏng của Timi</p>
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

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
                <p className="mt-1 text-sm text-gray-500">Quét QR thanh toán, đường dẫn, Wi-Fi, danh thiếp hoặc nội dung văn bản.</p>
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
                  <h2 className="text-xl font-bold text-gray-900">Tạo QR nhận tiền </h2>
                  <p className="mt-1 text-sm text-gray-500">QR luôn nhận tiền về tài khoản Timi Bank của bạn.</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <Building2 className="h-5 w-5 text-rose-500" />Tài khoản nhận tiền của bạn
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><p className="text-gray-500">Ngân hàng</p><p className="font-semibold text-gray-900">Timi Bank</p></div>
                    <div><p className="text-gray-500">Số tài khoản</p><p className="font-mono font-bold text-gray-900">{ownAccountNumber || "Chưa cập nhật"}</p></div>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">Chủ tài khoản: <span className="font-semibold text-gray-800">{ownAccountName || "Chưa cập nhật"}</span></p>
                  {!canCreateOwnQr && <p className="mt-3 text-xs font-medium text-rose-700">Cần số điện thoại gồm đúng 10 chữ số và tài khoản Timi Bank đang hoạt động để tạo QR.</p>}
                </div>
                <label className="block text-sm font-semibold text-gray-700">Số tiền <span className="font-normal text-gray-400">(tùy chọn)</span>
                  <input inputMode="numeric" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, "") })} placeholder="Để trống nếu người quét tự nhập" className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                </label>
                <label className="block text-sm font-semibold text-gray-700">Nội dung <span className="font-normal text-gray-400">(tùy chọn)</span>
                  <input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Ví dụ: Thanh toán đơn hàng" className="mt-1.5 w-full rounded-xl bg-gray-50 px-3 py-2.5 outline-none focus:ring-2 focus:ring-rose-500" />
                </label>
                {createError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>}
                <button disabled={isCreating || !canCreateOwnQr} className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                  {isCreating ? "Đang tạo QR..." : "Tạo QR"}
                </button>
              </form>
            )}
          </section>

          <section className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100 shadow-sm flex flex-col">
            {mode === "create" && generatedQr ? (
              <div className="h-full flex flex-col items-center text-center">
                <div className="flex items-center gap-2 text-emerald-600 self-start"><CheckCircle2 className="w-6 h-6" /><span className="font-bold">QR đã sẵn sàng</span></div>
                <img src={generatedQr.image} alt="Mã QR thanh toán  Timi" className="mt-5 w-full max-w-[340px] rounded-2xl border border-gray-100" />
                <PaymentSummary payment={generatedQr.payment} compact />
                <button type="button" onClick={downloadQr} className="mt-auto pt-6 w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 flex items-center justify-center gap-2"><Download className="w-5 h-5" />Tải ảnh QR</button>
              </div>
            ) : mode === "scan" && decodedContent ? (
              <DecodedQrSummary content={decodedContent} urlSafetyState={urlSafetyState} />
            ) : (
              <div className="h-full min-h-[440px] grid place-items-center text-center px-6">
                <div>
                  <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-rose-50"><QrCode className="w-8 h-8 text-rose-500" /></div>
                  <h2 className="mt-5 text-xl font-bold text-gray-900">{mode === "scan" ? "Sẵn sàng quét QR" : "QR sẽ hiển thị ở đây"}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{mode === "scan" ? "Mở camera hoặc chọn ảnh QR. Link sẽ được phân tích trước khi bạn có thể mở." : "Nhập số tiền hoặc nội dung để tạo QR nhận tiền cho chính bạn."}</p>
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

function DecodedQrSummary({
  content,
  urlSafetyState,
}: {
  content: DecodedQrContent;
  urlSafetyState: UrlSafetyState;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  if (content.kind === "payment") return null;

  const copyRawValue = async () => {
    try {
      await navigator.clipboard.writeText(content.rawValue);
      setCopyStatus("Đã sao chép nội dung QR.");
    } catch {
      setCopyStatus("Không thể sao chép tự động. Hãy chọn và sao chép nội dung bên dưới.");
    }
  };

  if (content.kind === "url") {
    const localRiskPresentation = {
      safe: {
        title: "Chưa thấy dấu hiệu bất thường",
        description: "Đây chỉ là kiểm tra cục bộ, không phải xác nhận website an toàn.",
        className: "border-emerald-100 bg-emerald-50 text-emerald-800",
        icon: ShieldCheck,
      },
      caution: {
        title: "Link cần kiểm tra thêm",
        description: "Link có một số đặc điểm thường dùng để che giấu địa chỉ đích.",
        className: "border-amber-100 bg-amber-50 text-amber-900",
        icon: AlertTriangle,
      },
      danger: {
        title: "Không mở tự động",
        description: "Link không hợp lệ hoặc có tín hiệu rủi ro cao. Timi đã chặn thao tác mở từ màn hình này.",
        className: "border-rose-100 bg-rose-50 text-rose-800",
        icon: ShieldAlert,
      },
    }[content.riskLevel];
    const isBlacklisted = urlSafetyState.status === "blocked";
    const riskPresentation = isBlacklisted
      ? {
          title: "Đã chặn link lừa đảo",
          description: urlSafetyState.reason,
          className: "border-rose-200 bg-rose-50 text-rose-800",
          icon: ShieldAlert,
        }
      : localRiskPresentation;
    const RiskIcon = riskPresentation.icon;
    // The database blacklist is the access-control decision. Local signals
    // remain visible to help the user judge a link, but a URL that is not
    // blacklisted can be opened immediately once the API has confirmed it.
    const mayOpen = content.normalizedUrl !== null && urlSafetyState.status === "clear";
    const mayCopy = !isBlacklisted;
    const safetyStatus = urlSafetyState.status === "checking"
      ? "Đang đối chiếu tên miền với blacklist URL…"
      : urlSafetyState.status === "unavailable"
        ? "Không thể đối chiếu blacklist URL. Timi sẽ không mở link này."
        : urlSafetyState.status === "clear"
          ? "Tên miền không nằm trong blacklist URL hiện tại."
          : null;

    return (
      <div className="h-full min-h-[440px] flex flex-col">
        <div className="flex items-center gap-2 text-gray-800">
          <Link2 className="w-6 h-6 text-rose-500" />
          <span className="font-bold">QR chứa đường dẫn</span>
        </div>

        <div className={`mt-5 rounded-2xl border p-4 ${riskPresentation.className}`}>
          <div className="flex items-start gap-3">
            <RiskIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">{riskPresentation.title}</p>
              <p className="mt-1 text-sm leading-relaxed">{riskPresentation.description}</p>
            </div>
          </div>
        </div>

        {safetyStatus && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${urlSafetyState.status === "unavailable" ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-600"}`}>
            {urlSafetyState.status === "checking" && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {safetyStatus}
          </p>
        )}

        <div className="mt-5 rounded-2xl bg-gray-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Tên miền nhận diện</p>
          <p className="mt-1.5 break-all font-semibold text-gray-900">{content.hostname ?? "Không xác định được tên miền"}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-gray-400">Nội dung QR</p>
          <p className="mt-1.5 max-h-28 overflow-y-auto break-all rounded-lg bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-700">{content.rawValue}</p>
        </div>

        {content.signals.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-bold text-gray-800">Tín hiệu cần lưu ý</p>
            <ul className="mt-2 space-y-2">
              {content.signals.map((signal) => (
                <li key={signal.code} className="flex gap-2 text-sm leading-relaxed text-gray-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                  {signal.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto space-y-3 pt-6">
          {copyStatus && <p className="text-center text-xs text-gray-500">{copyStatus}</p>}
          {mayCopy && (
            <button type="button" onClick={() => void copyRawValue()} className="w-full rounded-xl bg-gray-100 py-3 font-bold text-gray-700 hover:bg-gray-200 flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" />Sao chép
            </button>
          )}
          {mayOpen && (
            <button
              type="button"
              onClick={() => window.open(content.normalizedUrl!, "_blank", "noopener,noreferrer")}
              className={`w-full rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2 ${content.riskLevel === "caution" ? "bg-amber-600 hover:bg-amber-700" : "bg-rose-500 hover:bg-rose-600"}`}
            >
              <ExternalLink className="w-4 h-4" />
              Truy cập website
            </button>
          )}
        </div>
      </div>
    );
  }

  const nonLinkContent = {
    wifi: { title: "Thông tin Wi-Fi", description: "Timi không tự kết nối vào mạng Wi-Fi từ QR này.", icon: Wifi },
    contact: { title: "Danh thiếp", description: "Timi không tự thêm liên hệ từ QR này.", icon: FileText },
    phone: { title: "Số điện thoại", description: "Timi không tự gọi số điện thoại từ QR này.", icon: FileText },
    email: { title: "Địa chỉ email", description: "Timi không tự tạo email từ QR này.", icon: FileText },
    sms: { title: "Tin nhắn", description: "Timi không tự gửi tin nhắn từ QR này.", icon: FileText },
    text: { title: "Nội dung văn bản", description: "Nội dung được đọc từ mã QR.", icon: FileText },
  }[content.kind];
  const ContentIcon = nonLinkContent.icon;

  return (
    <div className="h-full min-h-[440px] flex flex-col">
      <div className="flex items-center gap-2 text-gray-800">
        <ContentIcon className="w-6 h-6 text-rose-500" />
        <span className="font-bold">{nonLinkContent.title}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-500">{nonLinkContent.description}</p>
      <div className="mt-5 max-h-72 overflow-y-auto rounded-2xl bg-gray-50 p-4">
        <p className="break-all whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700">{content.rawValue}</p>
      </div>
      <div className="mt-auto space-y-3 pt-6">
        {copyStatus && <p className="text-center text-xs text-gray-500">{copyStatus}</p>}
        <button type="button" onClick={() => void copyRawValue()} className="w-full rounded-xl bg-gray-100 py-3 font-bold text-gray-700 hover:bg-gray-200 flex items-center justify-center gap-2">
          <Copy className="w-4 h-4" />Sao chép
        </button>
      </div>
    </div>
  );
}
