import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, DatabaseZap, PlayCircle, ShieldAlert, ShieldCheck, UserCheck } from "lucide-react";

import PublicSiteChrome from "@/components/layout/PublicSiteChrome";
import axiosInstance from "@/services/api/axios";

type ManagedContent = { id: string; title: string | null; body: string | null; image_url: string | null };
const steps = [
  { icon: UserCheck, label: "Kiểm tra người nhận", title: "Timi xác minh thông tin đầu tiên", text: "Thông tin tài khoản, ngân hàng và lịch sử nhận diện được đặt cạnh nhau để bạn kiểm tra dễ hơn." },
  { icon: DatabaseZap, label: "Phân tích tín hiệu", title: "AI tìm dấu hiệu bất thường", text: "Hệ thống đối chiếu tín hiệu giao dịch và các mẫu rủi ro để giải thích điều gì cần chú ý." },
  { icon: ShieldAlert, label: "Cảnh báo rõ ràng", title: "Bạn có thêm thời gian quyết định", text: "Nếu rủi ro cao, Timi dừng luồng xác nhận và hướng dẫn bạn kiểm tra qua một kênh độc lập." },
  { icon: ShieldCheck, label: "Xác nhận an toàn", title: "Quyền quyết định vẫn thuộc về bạn", text: "Timi không tự chuyển tiền. Bạn chỉ tiếp tục sau khi đã xem cảnh báo và xác thực cần thiết." },
];

export default function DemoPage() {
  const [activeStep, setActiveStep] = useState(0);
  const managedQuery = useQuery({
    queryKey: ["public-content", "demo"],
    queryFn: async () => (await axiosInstance.get<ManagedContent[]>("/v1/content/demo")).data,
  });
  const step = steps[activeStep];
  const Icon = step.icon;

  return (
    <PublicSiteChrome>
      <main className="bg-slate-950 text-white">
        <section className="relative overflow-hidden px-6 py-20 sm:py-28 lg:px-12 xl:px-20">
          <div className="absolute -left-32 top-0 h-[32rem] w-[32rem] rounded-full bg-blue-600/20 blur-3xl" /><div className="absolute -right-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-violet-600/20 blur-3xl" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-200"><PlayCircle className="h-4 w-4" /> Demo Timi Guard</div><h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">60 giây để hiểu AI Anti-Scam bảo vệ bạn ra sao.</h1><p className="mt-6 text-lg leading-8 text-slate-300">Một quy trình minh bạch: nhận diện tín hiệu, giải thích rủi ro và để bạn chủ động xác nhận.</p></div>
            <div className="mt-14 grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Luồng mô phỏng</p><div className="mt-6 space-y-2">{steps.map(({ label }, index) => <button key={label} type="button" onClick={() => setActiveStep(index)} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition ${index === activeStep ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${index === activeStep ? "bg-white/20" : "bg-white/10"}`}>0{index + 1}</span><span className="text-sm font-semibold">{label}</span></button>)}</div></div>
              <div className="flex flex-col justify-between rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-700 p-7 shadow-2xl sm:p-10"><div><div className="flex items-center justify-between"><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-100">Bước 0{activeStep + 1}</span><Icon className="h-8 w-8 text-white/80" /></div><h2 className="mt-12 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">{step.title}</h2><p className="mt-5 max-w-xl text-lg leading-8 text-blue-100">{step.text}</p></div><div className="mt-12 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:gap-3"><button type="button" onClick={() => setActiveStep((value) => Math.max(0, value - 1))} disabled={activeStep === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"><ArrowLeft className="h-4 w-4" /> Trước</button><div className="flex min-w-0 justify-center gap-1.5">{steps.map((item, index) => <span key={item.label} className={`h-1.5 rounded-full transition-all ${index === activeStep ? "w-8 bg-white" : "w-1.5 bg-white/40"}`} />)}</div><button type="button" onClick={() => setActiveStep((value) => Math.min(steps.length - 1, value + 1))} disabled={activeStep === steps.length - 1} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4">Tiếp <ArrowRight className="h-4 w-4" /></button></div></div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-16 text-slate-900 sm:py-20 lg:px-12 xl:px-20"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center"><div><p className="text-sm font-bold uppercase tracking-widest text-blue-600">Nguyên tắc thiết kế</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Cảnh báo để bạn hiểu, không làm bạn hoảng sợ.</h2><div className="mt-8 space-y-4">{["Luôn hiển thị lý do cảnh báo bằng ngôn ngữ dễ hiểu.", "Không yêu cầu bạn cung cấp OTP, PIN hoặc mật khẩu cho người khác.", "Các giao dịch nhạy cảm vẫn cần xác thực của chính bạn."].map((item) => <div key={item} className="flex gap-3 leading-7 text-slate-600"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />{item}</div>)}</div></div><div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-7"><ShieldCheck className="h-10 w-10 text-blue-600" /><p className="mt-6 text-xl font-bold">Một lớp bảo vệ tốt luôn tôn trọng quyền chủ động.</p><p className="mt-3 leading-7 text-slate-500">Timi hỗ trợ bạn nhìn thấy rủi ro sớm hơn và quyết định chắc chắn hơn.</p></div></div></section>

        {managedQuery.data?.length ? <section className="bg-[#F3F5FF] px-6 py-16 text-slate-900 lg:px-12 xl:px-20"><div className="mx-auto max-w-6xl"><p className="text-sm font-bold uppercase tracking-widest text-violet-600">Nội dung từ Admin</p><div className="mt-6 grid gap-5 md:grid-cols-2">{managedQuery.data.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">{item.image_url && <img src={item.image_url} alt={item.title || "Hình ảnh demo Timi"} className="h-48 w-full object-contain" />}<div className="p-6"><h2 className="text-xl font-bold">{item.title || "AI Anti-Scam"}</h2><p className="mt-3 leading-7 text-slate-600">{item.body}</p></div></article>)}</div></div></section> : null}

        <section className="bg-white px-6 py-16 text-center text-slate-900"><h2 className="text-3xl font-bold">Muốn trải nghiệm thật?</h2><p className="mx-auto mt-3 max-w-xl leading-7 text-slate-500">Đăng ký tài khoản để dùng các luồng chuyển tiền, QR và bảo vệ giao dịch của Timi.</p><Link to="/register" className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 font-bold text-white transition hover:bg-slate-800">Mở tài khoản <ArrowRight className="h-5 w-5" /></Link></section>
      </main>
    </PublicSiteChrome>
  );
}
