import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Loader2, MessageCircle, Mic, Minimize2, Send, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { assistantApi, type AssistantChatTurn } from "@/api/assistant";
import TimiChibi from "@/components/ai/TimiChibi";
import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";
import { useAuthStore } from "@/stores/authStore";
import { useTimiAssistantStore } from "@/stores/timiAssistantStore";

type AssistantTip = {
  title: string;
  message: string;
};

type ChatMessage = AssistantChatTurn & { id: string };

const SENSITIVE_CREDENTIAL_PATTERN = /(?:mã\s*(?:otp|pin)|otp|pin|mật khẩu|password)\s*[:=-]?\s*\d{4,}/iu;
const SENSITIVE_CREDENTIAL_MESSAGE = "Bạn đừng gửi OTP, PIN hoặc mật khẩu vào chat nhé. Timi không bao giờ yêu cầu các mã này qua hội thoại.";

function firstName(fullName?: string | null): string {
  return fullName?.trim().split(/\s+/)[0] || "bạn";
}

function tipsForPath(pathname: string, name: string): AssistantTip[] {
  if (pathname === "/transfer") {
    return [
      { title: `Chào ${name}!`, message: "Timi ở đây cùng bạn. Nhớ kiểm tra tên người nhận trước khi chuyển nhé." },
      { title: "Mẹo nhỏ từ Timi", message: "Đừng chia sẻ OTP, mã PIN hay ảnh khuôn mặt cho bất kỳ ai." },
      { title: "Đang cần hỗ trợ?", message: "Khi phân tích giao dịch, Timi sẽ báo rõ các dấu hiệu cần lưu ý." },
    ];
  }
  if (pathname === "/qr") {
    return [
      { title: "Timi cùng quét QR", message: "QR chứa đường dẫn sẽ được kiểm tra blacklist trước khi bạn mở." },
      { title: "Nhắc bạn nè", message: "Chỉ quét QR từ nguồn bạn tin tưởng và xem kỹ nội dung trước khi tiếp tục." },
    ];
  }
  if (pathname === "/history") {
    return [
      { title: "Lịch sử giao dịch", message: "Bạn có thể xem lại giao dịch gần đây để phát hiện điều bất thường." },
      { title: "Timi luôn bên bạn", message: "Thấy giao dịch lạ? Hãy báo ngay để hệ thống hỗ trợ kiểm tra." },
    ];
  }
  if (pathname === "/confirm-location") {
    return [
      { title: `Chào ${name}!`, message: "Cấp vị trí gần đúng giúp Timi nhận ra đăng nhập bất thường và bảo vệ tài khoản tốt hơn." },
    ];
  }
  if (pathname === "/setup-pin" || pathname === "/setup-face") {
    return [
      { title: "Cùng hoàn thiện bảo mật nhé", message: "Thêm PIN và Face ID giúp Timi bảo vệ giao dịch của bạn tốt hơn." },
    ];
  }
  return [
    { title: `Chào ${name}!`, message: "Timi đã online. Mình sẽ đồng hành để mỗi giao dịch của bạn an toàn hơn." },
    { title: "Mẹo bảo mật", message: "Không chuyển tiền vội khi người lạ tạo cảm giác khẩn cấp hoặc thúc ép bạn." },
  ];
}

/** A lightweight companion that stays available across every authenticated page. */
export default function MiniTimiAssistant() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const activity = useTimiAssistantStore((state) => state.activity);
  const clearActivity = useTimiAssistantStore((state) => state.clearActivity);
  const {
    criticalAlert,
    risk,
    status: guardianStatus,
    error: guardianError,
    audioLevel,
    mediaTrackState,
    audioContextState,
    recorderState,
    audioChunkCount,
    audioAckCount,
    audioDataEventCount,
    audioSkippedCount,
    transcriptionMode,
  } = useScamGuardian();
  const [isOpen, setOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Chào bạn! Mình có thể hướng dẫn về chuyển tiền, QR, Face ID, PIN và các cảnh báo an toàn của Timi.",
    },
  ]);
  const handledGuardianAlertRef = useRef<unknown>(null);
  const name = firstName(user?.full_name);
  const tips = useMemo(() => tipsForPath(location.pathname, name), [location.pathname, name]);
  const tip = tips[tipIndex % tips.length];
  const activityTip: AssistantTip | null = activity.status === "analyzing"
    ? { title: "Timi đang kiểm tra nè", message: "Ráng chờ mình một xíu nhé. Timi đang đối chiếu giao dịch để bảo vệ bạn." }
    : activity.status === "warning"
      ? {
          title: "Timi thấy điều cần lưu ý",
          message: activity.riskLevel === "high"
            ? "Đừng vội chuyển tiền nhé! Hãy dừng lại và kiểm tra kỹ cảnh báo của Timi."
            : "Giao dịch này cần được kiểm tra thêm. Mình cùng xem kỹ trước khi tiếp tục nhé.",
        }
      : activity.status === "complete"
        ? { title: "Timi đã kiểm tra xong", message: activity.message ?? "Mình đã hoàn tất kiểm tra. Cảm ơn bạn đã kiên nhẫn nhé!" }
        : null;
  const displayedTip = activityTip ?? tip;
  const guardianStatusLabel = guardianStatus === "active"
    ? "đang bảo vệ"
    : guardianStatus === "starting"
      ? "đang khởi động"
      : guardianStatus === "error"
        ? "cần kiểm tra"
        : guardianStatus === "stopped"
          ? "đã dừng"
          : "đang chờ";
  const chatMutation = useMutation({
    mutationFn: assistantApi.chat,
    onSuccess: (response) => {
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.answer,
      }]);
    },
    onError: () => {
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Timi chưa thể kết nối để trả lời lúc này. Bạn thử lại sau một chút nhé.",
      }]);
    },
  });

  useEffect(() => {
    setTipIndex(0);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen || tips.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % tips.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [isOpen, tips.length]);

  useEffect(() => {
    if (activity.status !== "idle") setOpen(true);
  }, [activity.status]);

  useEffect(() => {
    if (activity.status !== "complete") return undefined;

    const timer = window.setTimeout(clearActivity, 5000);
    return () => window.clearTimeout(timer);
  }, [activity.status, clearActivity]);

  useEffect(() => {
    if (!criticalAlert) return;
    if (handledGuardianAlertRef.current === criticalAlert) return;
    handledGuardianAlertRef.current = criticalAlert;
    const message = [
      "🚨 Timi vừa phát hiện nguy cơ lừa đảo rất cao trong cuộc gọi.",
      `Mức nguy cơ hiện tại: ${risk.risk_score}/100.`,
      risk.explanation,
      "Bạn hãy dừng cuộc gọi, không chuyển tiền và không cung cấp OTP/PIN. Nếu cần giao dịch, hãy tự gọi lại ngân hàng bằng số chính thức.",
    ].join("\n\n");
    setChatMessages((current) => {
      return [...current, {
        id: `guardian-alert-${Date.now()}`,
        role: "assistant",
        content: message,
      }];
    });
    setOpen(true);
    setChatOpen(true);
  }, [criticalAlert, risk.explanation, risk.risk_score]);

  // The full transaction-analysis screen already contains the same chibi and
  // conversation, so avoid rendering a duplicate floating assistant there.
  if (activity.status === "analyzing" && !criticalAlert) return null;

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || chatMutation.isPending) return;
    setDraft("");

    if (SENSITIVE_CREDENTIAL_PATTERN.test(message)) {
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: SENSITIVE_CREDENTIAL_MESSAGE,
      }]);
      return;
    }

    const history = chatMessages.slice(-6).map(({ role, content }) => ({ role, content }));
    setChatMessages((current) => [...current, {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    }]);
    chatMutation.mutate({ message, history });
  };

  return (
    <aside className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 ${criticalAlert ? "z-[100]" : "z-40"}`} aria-label="Trợ lý Timi">
      {isOpen && !chatOpen && (
        <div className="absolute bottom-20 right-0 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-rose-100 bg-white/95 shadow-xl shadow-rose-200/50 backdrop-blur">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-rose-100/70 blur-2xl" />
          <div className="relative flex gap-3 p-4">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-900">{displayedTip.title}</p>
                <button type="button" onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Thu nhỏ trợ lý Timi">
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{displayedTip.message}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-500"><Sparkles className="h-3.5 w-3.5" />Timi AI Anti-Scam</span>
              <button type="button" onClick={() => setChatOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100">
                <MessageCircle className="h-3.5 w-3.5" />Trò chuyện
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/90 p-3" aria-label="Trạng thái Scam Guardian">
              <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-slate-700">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />Guardian {guardianStatusLabel}</span>
                <span className={guardianStatus === "active" ? "text-emerald-600" : guardianStatus === "error" ? "text-red-500" : "text-amber-600"}>{guardianStatus}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-4 text-slate-500">
                <span className="flex items-center gap-1"><Mic className="h-3 w-3" />Mic {audioLevel.toFixed(3)} · {mediaTrackState}</span>
                <span>WebAudio {audioContextState}</span>
                <span>Recorder {recorderState}</span>
                <span className="flex items-center gap-1"><AudioLines className="h-3 w-3" />Chunk {audioChunkCount} · ACK {audioAckCount}</span>
                <span>Data event {audioDataEventCount}</span>
                <span>Bỏ qua {audioSkippedCount}</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10px] leading-4 text-slate-500"><Wifi className="h-3 w-3" />STT {transcriptionMode}</div>
              <div className={`mt-1 text-[10px] font-bold ${risk.risk_score >= 80 ? "text-red-600" : risk.risk_score >= 30 ? "text-amber-600" : "text-emerald-600"}`}>Risk {risk.risk_score}/100 · {risk.recommended_action}</div>
              {guardianError && <p className="mt-1 break-words text-[10px] leading-4 text-red-500">{guardianError}</p>}
            </div>
          </div>
          </div>
        </div>
      )}
      {isOpen && chatOpen && (
        <section className="absolute bottom-20 right-0 flex h-[min(32rem,calc(100dvh-8rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-xl shadow-rose-200/50" aria-label="Trò chuyện với trợ lý Timi">
          <div className="flex items-center gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-slate-900">Trò chuyện với Timi</p><p className="text-[11px] text-rose-600">Chỉ hỗ trợ các chức năng trong ứng dụng</p></div>
            <button type="button" onClick={() => setChatOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600" aria-label="Quay lại trợ lý Timi"><Minimize2 className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-3">
            {chatMessages.map((chatMessage) => (
              <div key={chatMessage.id} className={`flex ${chatMessage.role === "user" ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${chatMessage.role === "user" ? "rounded-br-md bg-rose-500 text-white" : "rounded-bl-md border border-rose-100 bg-white text-slate-700"}`}>{chatMessage.content}</p>
              </div>
            ))}
            {chatMutation.isPending && <div className="flex items-center gap-2 text-xs text-slate-500"><TimiChibi compact walking /><Loader2 className="h-3.5 w-3.5 animate-spin" />Timi đang soạn câu trả lời…</div>}
          </div>
          <form onSubmit={submitChat} className="border-t border-slate-100 bg-white p-3">
            <p className="mb-2 text-[10px] leading-relaxed text-slate-400">Không nhập OTP, PIN, mật khẩu, số thẻ hoặc ảnh khuôn mặt.</p>
            <div className="flex gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={800} disabled={chatMutation.isPending} placeholder="Hỏi Timi về ứng dụng…" className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-60" />
              <button type="submit" disabled={!draft.trim() || chatMutation.isPending} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-500 text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Gửi tin nhắn"><Send className="h-4 w-4" /></button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (isOpen) setChatOpen(false);
        }}
        className="group relative ml-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-rose-500 via-pink-500 to-violet-500 p-1 shadow-lg shadow-rose-300 transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-rose-200"
        aria-label={isOpen ? "Đóng trợ lý Timi" : "Mở trợ lý Timi"}
        aria-expanded={isOpen}
      >
        <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-emerald-400" />
        <span className="grid h-full w-full place-items-center rounded-full bg-white"><TimiChibi compact walking /></span>
        {!isOpen && <span className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-600 text-white shadow-sm"><MessageCircle className="h-3.5 w-3.5" /></span>}
      </button>
    </aside>
  );
}
