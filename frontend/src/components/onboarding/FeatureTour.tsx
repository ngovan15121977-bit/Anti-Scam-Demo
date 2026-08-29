
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import TimiChibi from "@/components/ai/TimiChibi";
import { useAuthStore } from "@/stores/authStore";

type TourStep = {
  id: string;
  path: string;
  /** data-tour-id gắn trên nút nav */
  targetId: string;
  title: string;
  message: string;
  adminOnly?: boolean;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "home",
    path: "/dashboard",
    targetId: "nav-dashboard",
    title: "Chào nhà, mình là Timi! 👋",
    message:
      "Đây là trang chủ của bạn. Mọi hoạt động và tiện ích quan trọng đều tụ họp ở đây — khỏi phải đi tìm mỏi mắt nha! 😎",
  },
  {
    id: "transfer",
    path: "/transfer",
    targetId: "nav-transfer",
    title: "Chuyển tiền — để Timi canh nhé! 💸",
    message:
      "Bạn cứ nhập thông tin chuyển tiền, phần còn lại để Timi soi giúp. Giao dịch có gì đáng ngờ, Timi sẽ réo bạn trước khi tiền kịp… đi xa! 🕵️‍♂️",
  },
  {
    id: "qr",
    path: "/qr",
    targetId: "nav-qr",
    title: "Quét QR, nhưng đừng quét bừa! 📱",
    message:
      "Quét QR để thanh toán hay nhận tiền siêu nhanh. Nhưng nếu gặp link đáng ngờ, Timi sẽ kiểm tra trước — nhanh thì nhanh, an toàn vẫn phải trên hết! 🛡️",
  },
  {
    id: "history",
    path: "/history",
    targetId: "nav-history",
    title: "Ví đi đâu, tiền về đâu? 👀",
    message:
      "Đây là nơi xem lại toàn bộ lịch sử giao dịch. Thấy giao dịch nào trông 'sai sai' thì đừng ngại báo Timi — bắt scam càng sớm càng tốt! 🚨",
  },
  {
    id: "admin",
    path: "/admin",
    targetId: "nav-admin",
    title: "Khu vực dành cho 'người có quyền' 👑",
    message:
      "Chào mừng đến phòng điều khiển! Tại đây bạn có thể quản lý blacklist, xem báo cáo và phân quyền. Quyền lực lớn thì… nhớ dùng đúng chỗ nhé! 😎",
    adminOnly: true,
  },
  {
    id: "profile",
    path: "/me",
    targetId: "nav-profile",
    title: "Nhà riêng của tài khoản 🏠",
    message:
      "PIN, Face ID, mật khẩu và các cài đặt bảo mật đều nằm ở đây. Ghé qua kiểm tra một chút — bảo vệ tài khoản cũng giống khóa cửa trước khi đi ngủ vậy! 🔐",
  },
];

function storageKey(userId: string) {
  return `timi-feature-tour-done:${userId}`;
}

export function hasCompletedFeatureTour(userId: string) {
  return localStorage.getItem(storageKey(userId)) === "1";
}

export function markFeatureTourDone(userId: string) {
  localStorage.setItem(storageKey(userId), "1");
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FeatureTour({ open, onClose }: Props) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const steps = TOUR_STEPS.filter(
    (s) => !s.adminOnly || isAdmin,
  );

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[index];

  useEffect(() => {
    if (!open) return;

    setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !step) return;

    navigate(step.path);

    const tick = () => {
      const el = document.querySelector(
        `[data-tour-id="${step.targetId}"]`,
      );

      setRect(el?.getBoundingClientRect() ?? null);
    };

    tick();

    const t = window.setTimeout(tick, 120);

    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);

    return () => {
      window.clearTimeout(t);

      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
  }, [open, step, navigate]);

  if (!open || !step) return null;

  const finish = () => {
    if (user?.id) {
      markFeatureTourDone(user.id);
    }

    onClose();
  };

  const next = () => {
    if (index >= steps.length - 1) {
      finish();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const pad = 12;

  const highlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      {/* Overlay — click ngoài để bỏ qua */}
      <div
        className="absolute inset-0 bg-black/55"
        onClick={finish}
      />

      {/* Highlight quanh mục menu */}
      {highlight && (
        <div
          className="pointer-events-none absolute rounded-2xl ring-[3px] ring-violet-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] bg-transparent"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}

      {/* Bubble giới thiệu */}
      <div
        className="absolute left-1/2 z-10 w-[min(94vw,420px)] -translate-x-1/2 rounded-[1.75rem] border border-violet-100 bg-white p-5 shadow-2xl sm:p-6"
        style={{
          bottom:
            "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          {/* Timi */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200 sm:h-[4.5rem] sm:w-[4.5rem]">
            <TimiChibi compact />
          </div>

          {/* Nội dung */}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-500 sm:text-xs">
              Bước {index + 1}/{steps.length} · {step.title}
            </p>

            <p className="mt-2 text-[15px] font-medium leading-7 text-slate-800 sm:text-base sm:leading-7">
              {step.message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
          >
            Bỏ qua
          </button>

          <button
            type="button"
            onClick={next}
            className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-200 transition hover:shadow-lg"
          >
            {index >= steps.length - 1 ? "Xong rồi! 🎉" : "Tiếp theo →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
