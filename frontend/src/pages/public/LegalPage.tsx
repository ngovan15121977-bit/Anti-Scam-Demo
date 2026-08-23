import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axiosInstance from "@/services/api/axios";
import TimiLogo from "@/components/brand/TimiLogo";

interface LegalPageProps {
  type: "terms" | "privacy";
}

const content = {
  terms: {
    title: "Điều khoản sử dụng",
    intro: "Các điều khoản này quy định việc sử dụng dịch vụ Timi của bạn.",
    sections: [
      ["1. Chấp nhận điều khoản", "Bằng việc tạo tài khoản hoặc sử dụng Timi, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản sử dụng này."],
      ["2. Tài khoản người dùng", "Bạn có trách nhiệm cung cấp thông tin chính xác, bảo mật thông tin đăng nhập và thông báo ngay cho Timi khi phát hiện hoạt động bất thường."],
      ["3. Sử dụng dịch vụ", "Bạn chỉ sử dụng Timi cho mục đích hợp pháp và không được can thiệp, phá hoại hoặc sử dụng dịch vụ để thực hiện hành vi gian lận."],
      ["4. Giao dịch và bảo mật", "Timi áp dụng các lớp bảo vệ phù hợp, tuy nhiên bạn vẫn cần kiểm tra kỹ thông tin người nhận trước khi xác nhận giao dịch."],
      ["5. Thay đổi điều khoản", "Timi có thể cập nhật điều khoản để phù hợp với dịch vụ và quy định hiện hành. Phiên bản mới sẽ được công bố trên trang này."],
    ],
  },
  privacy: {
    title: "Chính sách bảo mật",
    intro: "Timi tôn trọng quyền riêng tư và minh bạch về cách dữ liệu của bạn được sử dụng.",
    sections: [
      ["1. Dữ liệu được thu thập", "Timi có thể thu thập thông tin tài khoản, thông tin giao dịch và dữ liệu kỹ thuật cần thiết để vận hành, bảo vệ và cải thiện dịch vụ."],
      ["2. Dữ liệu khuôn mặt", "Dữ liệu khuôn mặt được sử dụng cho mục đích đăng ký và xác thực theo lựa chọn của bạn. Timi không sử dụng dữ liệu này cho mục đích quảng cáo."],
      ["3. Mục đích sử dụng", "Dữ liệu được dùng để xác minh danh tính, phát hiện rủi ro, hỗ trợ giao dịch và liên hệ với bạn về các vấn đề liên quan đến tài khoản."],
      ["4. Bảo vệ dữ liệu", "Timi áp dụng các biện pháp kỹ thuật và tổ chức phù hợp để hạn chế truy cập, sử dụng hoặc tiết lộ dữ liệu trái phép."],
      ["5. Quyền của bạn", "Bạn có thể yêu cầu kiểm tra, cập nhật hoặc xóa thông tin cá nhân theo quy định và quy trình hỗ trợ của Timi."],
    ],
  },
} as const;

export default function LegalPage({ type }: LegalPageProps) {
  const page = content[type];
  const managedQuery = useQuery({
    queryKey: ["public-content", type],
    queryFn: async () => (await axiosInstance.get<Array<{ title: string | null; body: string | null; image_url: string | null }>>(`/v1/content/${type}`)).data,
  });
  const sections = managedQuery.data?.length
    ? managedQuery.data.map((item) => [item.title || "Nội dung", item.body || ""] as const)
    : page.sections;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl">
              <TimiLogo className="h-full w-full rounded-xl" />
            </span>
            <span className="text-xl font-bold text-slate-900">Timi</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-600">Timi</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{page.title}</h1>
          <p className="mt-4 leading-relaxed text-slate-600">{page.intro}</p>

          <div className="mt-10 space-y-8">
            {sections.map(([heading, text], index) => (
              <section key={heading}>
                <h2 className="text-lg font-bold text-slate-900">{heading}</h2>
                <p className="mt-2 leading-7 text-slate-600">{text}</p>
                {managedQuery.data?.[index]?.image_url && <div className="mt-4 flex min-h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-50"><img src={managedQuery.data[index].image_url || ""} alt={heading} className="max-h-80 w-full object-contain" /></div>}
              </section>
            ))}
          </div>

          <p className="mt-10 border-t border-slate-100 pt-6 text-sm text-slate-500">
            Cập nhật lần cuối: 19/08/2026
          </p>
        </div>
      </main>
    </div>
  );
}
