import { useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, ScanFace, ShieldAlert } from "lucide-react";

export interface FaceMatchResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  message: string;
}
interface Props {
  onVerified: (imageData: string, pin?: string) => Promise<FaceMatchResult>;
  onCancel: () => void;
  isLoading: boolean;
  requirePin?: boolean;
  onSetupFace?: () => void;
  mode?: "verification" | "enrollment";
}

export default function FaceVerificationModal({
  onVerified,
  onCancel,
  isLoading,
  requirePin = false,
  onSetupFace,
  mode = "verification",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState<"pin" | "face">(requirePin ? "pin" : "face");
  const [pin, setPin] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FaceMatchResult | null>(null);
  const [needsFaceSetup, setNeedsFaceSetup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraReady || !video || !stream) return;
    video.srcObject = stream;
    void video
      .play()
      .catch(() =>
        setError("Không thể phát hình từ camera. Hãy thử mở lại camera."),
      );
  }, [cameraReady]);

  const startCamera = async () => {
    setError("");
    setVideoLoaded(false);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      stopCamera();
      streamRef.current = stream;
      setCameraReady(true);
    } catch {
      setError("Không thể mở camera. Hãy cấp quyền camera và thử lại.");
    }
  };

  const proceedToFace = () => {
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Nhập mã PIN gồm 4–6 chữ số để tiếp tục.");
      return;
    }
    setError("");
    setStep("face");
    void startCamera();
  };

  const verify = async () => {
    if (isSubmitting || isLoading) return;
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("Camera chưa sẵn sàng. Vui lòng thử lại.");
      return;
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      256 / Math.max(video.videoWidth, video.videoHeight),
    );
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.82);
    setError("");
    setResult(null);
    setNeedsFaceSetup(false);
    setCapturedImage(imageData);
    setIsSubmitting(true);
    let matched = false;
    try {
      const match = await onVerified(imageData, pin);
      setResult(match);
      matched = match.matched;
      if (matched) stopCamera();
    } catch (requestError: any) {
      const detail = requestError?.response?.data?.detail;
      setNeedsFaceSetup(requestError?.response?.status === 409);
      setError(
        Array.isArray(detail)
          ? detail.map((item) => item.msg).join("; ")
          : detail ||
              requestError?.message ||
              "Không thể xác thực khuôn mặt. Hãy thử lại.",
      );
    } finally {
      if (!matched) setCapturedImage(null);
      setIsSubmitting(false);
    }
  };

  const isPinStep = step === "pin";
  const isEnrollment = mode === "enrollment";
  const isBusy = isLoading || isSubmitting;
  const faceTitle = isEnrollment ? "Đăng ký khuôn mặt" : "Xác thực khuôn mặt";
  const faceDescription = isEnrollment
    ? "Đặt khuôn mặt vào khung hình để tạo dữ liệu khuôn mặt riêng cho tài khoản của bạn. Ảnh đại diện không được dùng để xác thực."
    : "Đặt khuôn mặt vào khung hình để AI đối chiếu với dữ liệu đã đăng ký.";
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
          {isPinStep ? (
            <KeyRound className="h-7 w-7 text-rose-600" />
          ) : (
            <ScanFace className="h-7 w-7 text-rose-600" />
          )}
        </div>
        <h2 className="mt-4 text-center text-xl font-bold text-slate-900">
          {isPinStep ? "Xác nhận mã PIN" : faceTitle}
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">
          {isPinStep
            ? "Bạn cần xác nhận mã PIN giao dịch trước khi quét khuôn mặt."
            : faceDescription}
        </p>
        {isPinStep ? (
          <input
            autoFocus
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            type="password"
            placeholder="Nhập PIN giao dịch"
            className="mt-5 w-full rounded-xl border border-slate-200 p-4 text-center text-xl tracking-[0.45em] outline-none focus:ring-2 focus:ring-rose-300"
          />
        ) : (
          <div className="relative mt-5 aspect-square overflow-hidden rounded-2xl bg-slate-900">
            {cameraReady ? (
              <video
                ref={videoRef}
                onLoadedMetadata={() => setVideoLoaded(true)}
                onCanPlay={() => setVideoLoaded(true)}
                muted
                playsInline
                autoPlay
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
                <Camera className="h-10 w-10" />
                <span className="text-sm">
                  Camera chỉ được dùng trong phiên này.
                </span>
              </div>
            )}
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Ảnh khuôn mặt vừa chụp để xác thực"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {cameraReady && (
              <div className="pointer-events-none absolute inset-[15%] rounded-[45%] border-2 border-emerald-300 shadow-[0_0_0_999px_rgba(15,23,42,.18)]" />
            )}
            {cameraReady && !isBusy && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-slate-950/65 px-3 py-2 text-center text-xs font-medium text-white">
                Giữ khuôn mặt yên trong khung và chọn nơi có đủ ánh sáng.
              </div>
            )}
            {isBusy && !isPinStep && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/65 text-center text-white">
                <div className="relative h-20 w-20">
                  <div className="absolute inset-0 rounded-full border-4 border-white/25" />
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-300 border-r-emerald-300" />
                  <ScanFace className="absolute inset-0 m-auto h-8 w-8 text-white" />
                </div>
                <p className="mt-4 text-sm font-bold">
                  {isEnrollment ? "Đang tạo dữ liệu khuôn mặt..." : "AI đang đối chiếu khuôn mặt..."}
                </p>
                <p className="mt-1 text-xs text-slate-200">Ảnh đã được chụp. Vui lòng không rời khỏi màn hình.</p>
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="mt-3 flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            {error}
          </p>
        )}
        {needsFaceSetup && onSetupFace && (
          <button
            onClick={onSetupFace}
            className="mt-3 w-full rounded-xl bg-amber-100 py-3 text-sm font-bold text-amber-900"
          >
            Đi tới cài đặt khuôn mặt
          </button>
        )}
        {result && (
          <p
            className={`mt-3 rounded-xl p-3 text-sm ${result.matched ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
          >
            {result.message} Độ khớp:{" "}
            <strong>{Math.round(result.similarity * 100)}%</strong>.
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700"
          >
            Hủy
          </button>
          {isPinStep ? (
            <button
              onClick={proceedToFace}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white"
            >
              Tiếp tục
            </button>
          ) : !cameraReady ? (
            <button
              onClick={() => void startCamera()}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white"
            >
              Mở camera
            </button>
          ) : (
            <button
              onClick={() => void verify()}
              disabled={isBusy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isBusy
                ? isEnrollment
                  ? "Đang đăng ký..."
                  : "Đang xác thực..."
                : isEnrollment
                  ? "Đăng ký khuôn mặt"
                  : videoLoaded
                    ? "Xác thực khuôn mặt"
                    : "Xác thực khuôn mặt"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
