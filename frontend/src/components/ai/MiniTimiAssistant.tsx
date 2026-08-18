import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, Minimize2, Send, Sparkles, Shield, X, Zap } from "lucide-react";
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

export default function MiniTimiAssistant() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const activity = useTimiAssistantStore((state) => state.activity);
  const clearActivity = useTimiAssistantStore((state) => state.clearActivity);
  const { criticalAlert, risk } = useScamGuardian();
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

  const chatMutation = useMutation({
    mutationFn: assistantApi.chat,
    onSuccess: (response) => {
      setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: response.answer }]);
    },
    onError: () => {
      setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: "Timi chưa thể kết nối để trả lời lúc này. Bạn thử lại sau một chút nhé." }]);
    },
  });

  useEffect(() => { setTipIndex(0); }, [location.pathname]);

  useEffect(() => {
    if (!isOpen || tips.length <= 1) return undefined;
    const timer = window.setInterval(() => setTipIndex((current) => (current + 1) % tips.length), 9000);
    return () => window.clearInterval(timer);
  }, [isOpen, tips.length]);

  useEffect(() => { if (activity.status !== "idle") setOpen(true); }, [activity.status]);

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
    setChatMessages((current) => [...current, { id: `guardian-alert-${Date.now()}`, role: "assistant", content: message }]);
    setOpen(true);
    setChatOpen(true);
  }, [criticalAlert, risk.explanation, risk.risk_score]);

  if (activity.status === "analyzing" && !criticalAlert) return null;

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || chatMutation.isPending) return;
    setDraft("");
    if (SENSITIVE_CREDENTIAL_PATTERN.test(message)) {
      setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: SENSITIVE_CREDENTIAL_MESSAGE }]);
      return;
    }
    const history = chatMessages.slice(-6).map(({ role, content }) => ({ role, content }));
    setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: message }]);
    chatMutation.mutate({ message, history });
  };

  // Render via a portal straight onto <body>. This is the key fix: if any
  // ancestor in the app tree has `transform`, `filter`, `perspective`, or
  // `will-change`, `position: fixed` inside it stops being fixed to the
  // viewport and instead "fixes" to that ancestor — which is what makes a
  // fixed widget appear to drift while scrolling. Mounting outside the
  // normal DOM tree (on document.body) guarantees the widget always stays
  // pinned to the screen regardless of what any parent component does.
  const widget = (
    <aside className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 ${criticalAlert ? "z-[100]" : "z-40"}`} aria-label="Trợ lý Timi">
      {/* Tip Card */}
      {isOpen && !chatOpen && (
        <div className="absolute bottom-24 right-0 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-blue-100/60 bg-white/80 backdrop-blur-xl shadow-2xl shadow-blue-200/30 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-indigo-500 to-violet-500" />
          <div className="relative flex gap-4 p-5">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1 pr-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-extrabold text-slate-900">{displayedTip.title}</p>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 border border-blue-100">
                    <Zap className="h-2.5 w-2.5" />AI
                  </span>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="Thu nhỏ trợ lý Timi">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{displayedTip.message}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-500">
                  <Shield className="h-3.5 w-3.5" />Timi AI Anti-Scam
                </span>
                <button type="button" onClick={() => setChatOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all hover:-translate-y-0.5">
                  <MessageCircle className="h-3.5 w-3.5" />Trò chuyện
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && chatOpen && (
        <section className="absolute bottom-24 right-0 flex h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-blue-100/60 bg-white/90 backdrop-blur-xl shadow-2xl shadow-blue-200/30 animate-in zoom-in-95 duration-200" aria-label="Trò chuyện với trợ lý Timi">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-blue-50 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 px-5 py-4">
            <TimiChibi compact walking />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-extrabold text-slate-900">Trò chuyện với Timi</p>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[11px] text-indigo-500 font-medium">Chỉ hỗ trợ các chức năng trong ứng dụng</p>
            </div>
            <button type="button" onClick={() => setChatOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-600 transition-colors" aria-label="Quay lại trợ lý Timi">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4">
            {chatMessages.map((chatMessage) => (
              <div key={chatMessage.id} className={`flex ${chatMessage.role === "user" ? "justify-end" : "justify-start"}`}>
                {chatMessage.role === "assistant" && (
                  <div className="mr-2 mt-1 shrink-0">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
                <p className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                  chatMessage.role === "user"
                    ? "rounded-br-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                    : "rounded-bl-md border border-slate-100 bg-white text-slate-700"
                }`}>
                  {chatMessage.content}
                </p>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="h-3 w-3 text-white animate-pulse" />
                </div>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Timi đang soạn câu trả lời…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={submitChat} className="border-t border-slate-100 bg-white/80 backdrop-blur-sm p-4">
            <p className="mb-2.5 text-[10px] leading-relaxed text-slate-400 flex items-center gap-1">
              <Shield className="h-3 w-3 text-amber-400" />
              Không nhập OTP, PIN, mật khẩu, số thẻ hoặc ảnh khuôn mặt.
            </p>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={800}
                disabled={chatMutation.isPending}
                placeholder="Hỏi Timi về ứng dụng…"
                className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-blue-400/30 focus:bg-white transition-all disabled:opacity-60 border border-transparent focus:border-blue-200"
              />
              <button
                type="submit"
                disabled={!draft.trim() || chatMutation.isPending}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (isOpen) setChatOpen(false);
        }}
        className="group relative ml-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-[2px] shadow-xl shadow-blue-900/30 transition-all hover:scale-105 hover:shadow-2xl hover:shadow-blue-900/40 focus:outline-none focus:ring-4 focus:ring-blue-300/30"
        aria-label={isOpen ? "Đóng trợ lý Timi" : "Mở trợ lý Timi"}
        aria-expanded={isOpen}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-500/20 to-violet-500/20 blur-md animate-pulse" />
        <span className="grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-slate-900 to-blue-950 relative overflow-hidden">
          <TimiChibi compact walking />
        </span>
        {!isOpen && (
          <span className="absolute -left-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md animate-bounce">
            <MessageCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
    </aside>
  );

  return createPortal(widget, document.body);
}