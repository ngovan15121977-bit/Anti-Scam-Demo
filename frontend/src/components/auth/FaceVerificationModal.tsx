import { useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, ScanFace, ShieldAlert } from "lucide-react";
import { authApi } from "@/api/auth";

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
  const [frameQuality, setFrameQuality] = useState<"checking" | "holding" | "ready" | "adjust-light" | "too-dark" | "too-bright" | "invalid">("checking");
  const [frameBrightness, setFrameBrightness] = useState(128);
  const [frameQualityMessage, setFrameQualityMessage] = useState("Đang kiểm tra khung hình...");
  const qualityCheckInFlight = useRef(false);
  const qualityRequestId = useRef(0);
  const lastGoodFrame = useRef<string | null>(null);
  const qualityReady = useRef(false);
  const stablePositionReady = useRef(false);
  const livenessPassed = useRef(false);
  const stableTimer = useRef<number | null>(null);
  const verifyRef = useRef<((automatic?: boolean) => Promise<void>) | null>(null);
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

  useEffect(() => {
    if (!cameraReady || !videoLoaded) return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const motionCanvas = document.createElement("canvas");
    motionCanvas.width = 32;
    motionCanvas.height = 32;
    const motionContext = motionCanvas.getContext("2d", { willReadFrequently: true });
    let previousMotionFrame: Uint8ClampedArray | null = null;
    let motionEvents = 0;
    let lastMotionAt = 0;
    let challengeStartedAt = 0;
    const livenessStartedAt = performance.now();
    const inspectFrame = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      if (motionContext) {
        motionContext.drawImage(video, 0, 0, 32, 32);
        const currentFrame = motionContext.getImageData(0, 0, 32, 32).data;
        if (previousMotionFrame) {
          let difference = 0;
          for (let index = 0; index < currentFrame.length; index += 4) {
            difference += Math.abs(currentFrame[index] - previousMotionFrame[index]);
            difference += Math.abs(currentFrame[index + 1] - previousMotionFrame[index + 1]);
            difference += Math.abs(currentFrame[index + 2] - previousMotionFrame[index + 2]);
          }
          const motion = difference / (32 * 32 * 3);
          const now = performance.now();
          if (stablePositionReady.current && motion >= 7 && now - lastMotionAt >= 550) {
            motionEvents += 1;
            lastMotionAt = now;
          }
          // Require several independent changes. A single compressed/static
          // image must not immediately unlock enrollment or verification.
          if (stablePositionReady.current && motionEvents >= 2 && now - livenessStartedAt >= 1500) {
            livenessPassed.current = true;
          }
        }
        previousMotionFrame = new Uint8ClampedArray(currentFrame);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total += 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
      }
      const brightness = total / (pixels.length / 4);
      setFrameBrightness(brightness);
      if (brightness < 45) {
        qualityReady.current = false;
        setFrameQuality("too-dark");
        setFrameQualityMessage("Ánh sáng quá yếu. Hãy bật đèn hoặc di chuyển đến nơi sáng hơn.");
        return;
      }
      if (brightness > 225) {
        qualityReady.current = false;
        setFrameQuality("too-bright");
        setFrameQualityMessage("Ảnh đang bị chói. Hãy tránh ánh sáng chiếu thẳng vào camera.");
        return;
      }
      if (qualityCheckInFlight.current) return;
      qualityCheckInFlight.current = true;
      const requestId = ++qualityRequestId.current;
      canvas.width = 256;
      canvas.height = 256;
      const cropSize = Math.min(video.videoWidth, video.videoHeight);
      const cropX = (video.videoWidth - cropSize) / 2;
      const cropY = (video.videoHeight - cropSize) / 2;
      context.filter = "contrast(1.12) saturate(1.05)";
      context.save();
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
      context.restore();
      context.filter = "none";
      void authApi.checkFaceQuality(canvas.toDataURL("image/jpeg", 0.85))
        .then((quality) => {
          if (requestId !== qualityRequestId.current) return;
          if (quality.ready) {
            if (!stablePositionReady.current) {
              qualityReady.current = false;
              if (stableTimer.current !== null) window.clearTimeout(stableTimer.current);
              setFrameQuality("holding");
              setFrameQualityMessage("Đã nhận diện khuôn mặt. Hãy giữ nguyên vị trí trong 1 giây...");
              stableTimer.current = window.setTimeout(() => {
                stablePositionReady.current = true;
                if (mode !== "enrollment") {
                  livenessPassed.current = true;
                  setFrameQualityMessage("Đã ổn định. Đang tiếp tục xác thực...");
                  return;
                }
                motionEvents = 0;
                lastMotionAt = performance.now();
                challengeStartedAt = performance.now();
                setFrameQuality("holding");
                setFrameQualityMessage("Đã ổn định. Hãy chậm rãi quay đầu sang trái rồi sang phải để xác minh người thật.");
              }, 1000);
              return;
            }
            if (!livenessPassed.current) {
              qualityReady.current = false;
              setFrameQuality("holding");
              setFrameQualityMessage("Hãy quay đầu sang trái rồi sang phải. Không dùng ảnh hoặc video.");
              return;
            }
            lastGoodFrame.current = canvas.toDataURL("image/jpeg", 0.88);
            if (qualityReady.current) return;
            qualityReady.current = true;
            setFrameQuality("ready");
            setFrameQualityMessage("Đã xác minh người thật. Đang tiếp tục...");
            window.setTimeout(() => void verifyRef.current?.(true), 150);
          } else {
            lastGoodFrame.current = null;
            qualityReady.current = false;
            // A deliberate head turn can briefly move the face outside the
            // strict center box. Keep the liveness challenge alive so the
            // instruction remains visible instead of restarting silently.
            if (
              stablePositionReady.current &&
              performance.now() - challengeStartedAt < 10000 &&
              (quality.rule === "no_face" ||
                quality.rule === "off_center" ||
                quality.rule === "obstructed_eyes")
            ) {
              setFrameQuality("holding");
              setFrameQualityMessage("Đang xác minh chuyển động. Hãy quay trái/phải thật chậm và đưa mặt trở lại khung hình.");
              return;
            }
            stablePositionReady.current = false;
            livenessPassed.current = false;
            motionEvents = 0;
            if (stableTimer.current !== null) window.clearTimeout(stableTimer.current);
            setFrameQuality("invalid");
            setFrameQualityMessage(quality.message);
          }
        })
        .catch(() => {
          if (requestId !== qualityRequestId.current) return;
          setFrameQuality("invalid");
          setFrameQualityMessage("Đưa mặt vào giữa khung, đến gần hơn, giữ yên và đảm bảo đủ sáng.");
        })
        .finally(() => {
          qualityCheckInFlight.current = false;
        });
    };
    inspectFrame();
    const intervalId = window.setInterval(inspectFrame, 450);
    return () => {
      window.clearInterval(intervalId);
      qualityRequestId.current += 1;
    };
  }, [cameraReady, videoLoaded, requirePin, mode]);

  const startCamera = async () => {
    setError("");
    setVideoLoaded(false);
    setCapturedImage(null);
    setFrameQuality("checking");
    setFrameQualityMessage("Đang kiểm tra khung hình...");
    qualityReady.current = false;
    stablePositionReady.current = false;
    livenessPassed.current = false;
    lastGoodFrame.current = null;
    if (stableTimer.current !== null) window.clearTimeout(stableTimer.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 24 },
        },
        audio: false,
      });
      stopCamera();
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
          exposureMode?: string[];
          whiteBalanceMode?: string[];
        };
        const advanced: Record<string, string> = {};
        if (capabilities.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
        if (capabilities.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
        if (capabilities.whiteBalanceMode?.includes("continuous")) advanced.whiteBalanceMode = "continuous";
        if (Object.keys(advanced).length > 0) {
          await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
        }
      }
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

  const verify = async (automatic = false) => {
    if (isSubmitting || isLoading) return;
    if (!automatic && frameQuality !== "ready") {
      setError("Khung hình chưa đạt điều kiện. Hãy căn giữa khuôn mặt và điều chỉnh ánh sáng rồi thử lại.");
      return;
    }
    const video = videoRef.current;
    if (!videoLoaded || !video?.videoWidth || !video.videoHeight) {
      setError("Camera chưa sẵn sàng. Vui lòng thử lại.");
      return;
    }
    const canvas = document.createElement("canvas");
    // The camera may return a 16:9 (or portrait) frame while the UI is square.
    // Capture the same centered square that the user sees in the preview. This
    // prevents the submitted face from appearing horizontally offset.
    const cropSize = Math.min(video.videoWidth, video.videoHeight);
    const cropX = (video.videoWidth - cropSize) / 2;
    const cropY = (video.videoHeight - cropSize) / 2;
    // 512px remains well below the 5 MB API limit at JPEG 0.82 while keeping
    // the face large enough for the server detector.
    const outputSize = Math.min(512, cropSize);
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Không thể chuẩn bị ảnh từ camera. Hãy thử mở lại camera.");
      return;
    }
    if (frameBrightness < 110) {
      context.filter = `brightness(${Math.min(1.35, 128 / Math.max(frameBrightness, 45))}) contrast(1.08)`;
    }
    context.save();
    context.translate(outputSize, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize,
    );
    context.restore();
    context.filter = "none";
    // Reuse the exact frame that passed the quality gate for automatic
    // enrollment/verification. Capturing a new frame here could catch a
    // movement or obstruction after the UI already reported "ready".
    const imageData = automatic && lastGoodFrame.current
      ? lastGoodFrame.current
      : canvas.toDataURL("image/jpeg", 0.88);
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
      if (!matched && !requirePin) {
        qualityReady.current = false;
        if (stableTimer.current !== null) window.clearTimeout(stableTimer.current);
        setFrameQuality("checking");
        setFrameQualityMessage("Chưa đủ độ khớp. Đang lấy lại khung hình để xác thực lại...");
      }
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

  verifyRef.current = verify;
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
        {!isPinStep && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
            Vui lòng loại bỏ các vật cản khỏi khuôn mặt trước khi quét.
          </p>
        )}
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
                style={{ filter: `${frameBrightness < 110 ? `brightness(${Math.min(1.35, 128 / Math.max(frameBrightness, 45))}) ` : ""}contrast(1.12) saturate(1.05)` }}
                className="h-full w-full -scale-x-100 object-cover object-center"
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
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            )}
            {cameraReady && (
              <div className="pointer-events-none absolute inset-[15%] rounded-[45%] border-2 border-emerald-300 shadow-[0_0_0_999px_rgba(15,23,42,.18)]" />
            )}
            {cameraReady && !isBusy && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-slate-950/65 px-3 py-2 text-center text-xs font-medium text-white">
                Đặt mặt gần, nằm giữa khung, nhìn rõ và giữ yên ở nơi đủ sáng.
              </div>
            )}
            {cameraReady && !isBusy && frameQuality !== "ready" && (
              <div className="pointer-events-none absolute inset-x-3 top-3 rounded-xl bg-amber-950/75 px-3 py-2 text-center text-xs font-semibold text-amber-100">
                {frameQualityMessage}
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
              disabled={isBusy || !videoLoaded || frameQuality !== "ready"}
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
                    : "Đang chuẩn bị camera..."}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
