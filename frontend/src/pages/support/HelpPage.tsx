import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Copy, HelpCircle, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "@/services/api/axios";

type SupportContact = { email: string; phone: string; account_number: string; account_name: string; bank_name: string };
type ManagedFaq = { title: string | null; body: string | null; image_url: string | null; content_type?: string };

const faqs = [
  ["Làm sao để đổi mật khẩu?", "Vào Tài khoản, chọn Bảo mật tài khoản rồi nhập mật khẩu hiện tại và mật khẩu mới."],
  ["Tôi quên mã PIN giao dịch thì phải làm gì?", "Vào Tài khoản > Thay đổi mã PIN để cập nhật lại PIN sau khi xác thực."],
  ["Tại sao giao dịch cần xác minh khuôn mặt?", "Đây là lớp bảo vệ giúp xác nhận đúng chủ tài khoản trước các thao tác nhạy cảm."],
  ["Tôi cần hỗ trợ trực tiếp thì liên hệ ở đâu?", "Bạn có thể gửi email cho admin hoặc chuyển khoản phí hỗ trợ vào tài khoản được hiển thị bên dưới."],
];

export default function HelpPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(0);
  const contactQuery = useQuery({ queryKey: ["support-contact"], queryFn: async () => (await axiosInstance.get<SupportContact>("/v1/support/contact")).data, staleTime: 5 * 60_000 });
  const contentQuery = useQuery({ queryKey: ["public-content", "help"], queryFn: async () => (await axiosInstance.get<ManagedFaq[]>("/v1/content/help")).data });
  const faqItems = contentQuery.data?.length
    ? contentQuery.data.map((item) => ({ question: item.title || "Câu hỏi", answer: item.body || "", image: item.image_url }))
    : faqs.map(([question, answer]) => ({ question, answer, image: null }));
  const copy = (value?: string | null) => void navigator.clipboard?.writeText(value || "");

  return (
    <div className="min-h-screen bg-[#f5f3ff] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-4xl">
      <button type="button" onClick={() => navigate("/me")} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-violet-600"><ArrowLeft className="h-4 w-4" /> Quay lại tài khoản</button>
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 p-7 text-white shadow-xl shadow-violet-200"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15"><HelpCircle className="h-7 w-7" /></div><div><h1 className="text-2xl font-bold">Câu hỏi thường gặp</h1><p className="mt-1 text-sm text-violet-100">Tìm câu trả lời nhanh hoặc liên hệ với admin.</p></div></div></div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">{faqItems.map(({ question, answer, image }, index) => <div key={`${question}-${index}`} className={index ? "border-t border-slate-100" : ""}><button type="button" onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-semibold text-slate-900 sm:px-6"><span>{question}</span><ChevronDown className={`h-5 w-5 shrink-0 text-violet-500 transition-transform ${open === index ? "rotate-180" : ""}`} /></button>{open === index && <div className="px-5 pb-5 sm:px-6"><p className="text-sm leading-6 text-slate-500">{answer}</p>{image && <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100 bg-slate-50"><img src={image} alt={question} className="max-h-64 w-full object-contain" /></div>}</div>}</div>)}</section>
        <section className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MessageCircle className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Liên hệ admin</h2><p className="text-sm text-slate-400">Thông tin hỗ trợ chính thức</p></div></div>{contactQuery.isPending ? <p className="text-sm text-slate-400">Đang tải thông tin...</p> : contactQuery.isError ? <p className="text-sm text-red-500">Chưa cấu hình thông tin liên hệ admin.</p> : contactQuery.data && <div className="space-y-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gmail admin</p><p className="mt-1 break-all font-semibold text-slate-800">{contactQuery.data.email}</p></div><button type="button" onClick={() => copy(contactQuery.data!.email)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label="Sao chép email"><Copy className="h-4 w-4" /></button></div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Số điện thoại admin</p><p className="mt-1 font-semibold text-slate-800">{contactQuery.data.phone}</p></div><button type="button" onClick={() => copy(contactQuery.data!.phone)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label="Sao chép số điện thoại"><Phone className="h-4 w-4" /></button></div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Số tài khoản {contactQuery.data.bank_name}</p><p className="mt-1 font-semibold text-slate-800">{contactQuery.data.account_number}</p><p className="mt-1 text-sm text-slate-500">{contactQuery.data.account_name}</p></div><button type="button" onClick={() => copy(contactQuery.data!.account_number)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" aria-label="Sao chép số tài khoản"><Copy className="h-4 w-4" /></button></div></div><div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Chỉ sử dụng thông tin liên hệ hiển thị trong ứng dụng.</div></div>}</section>
      </div>
    </div></div>
  );
}
