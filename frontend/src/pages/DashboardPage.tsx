import { useNavigate } from "react-router-dom";
import {
  Shield,
  ArrowRight,
  Zap,
  Lock,
  Smartphone,
  CreditCard,
  Users,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  Heart,
  Gamepad2,
  Receipt,
  Plane,
  ArrowRightLeft,
  ShoppingCart,
  LayoutGrid,
  Film,
  Car,
  PieChart,
  Landmark,
  Wallet,
  Ticket,
  Bus,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";

const services = [
  { icon: Sparkles, label: "MoMo đề xuất" },
  { icon: Shield, label: "Tài chính - Bảo hiểm" },
  { icon: Film, label: "Mua vé xem phim" },
  { icon: Heart, label: "Ví Nhân Ái" },
  { icon: Gamepad2, label: "Trò chơi" },
  { icon: Smartphone, label: "Điện thoại - Data 4G/5G" },
  { icon: Receipt, label: "Thanh toán hóa đơn" },
  { icon: Plane, label: "Du lịch - Đi lại" },
  { icon: ArrowRightLeft, label: "Chuyển tiền - Thanh toán" },
  { icon: ShoppingCart, label: "Thương mại điện tử" },
  { icon: LayoutGrid, label: "Game - Ứng dụng" },
];

const tags = [
  { icon: Sparkles, label: "Trợ Thủ Tài Chính" },
  { icon: Car, label: "Tra cứu phạt nguội" },
  { icon: PieChart, label: "Quản Lý Chi Tiêu" },
  { icon: Landmark, label: "Trung Tâm Tài Chính" },
  { icon: Users, label: "Quỹ Nhóm" },
  { icon: Wallet, label: "Ví Trả Sau" },
  { icon: Zap, label: "Vay Nhanh" },
  { icon: Heart, label: "Trái Tim MoMo" },
  { icon: Ticket, label: "Vé xem phim" },
  { icon: Bus, label: "Vé xe khách" },
];

const features = [
  {
    icon: ArrowRight,
    title: "Chuyển tiền siêu tốc",
    desc: "Chuyển tiền 24/7 đến mọi ngân hàng, chỉ cần số điện thoại",
    color: "bg-rose-100 text-rose-600",
  },
  {
    icon: CreditCard,
    title: "Thanh toán mọi dịch vụ",
    desc: "Hóa đơn điện nước, nạp điện thoại, vé xem phim... tất cả trong 1 chạm",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: Shield,
    title: "AI Anti-Scam",
    desc: "Trí tuệ nhân tạo phân tích real-time, chặn giao dịch rủi ro trước khi xảy ra",
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: Lock,
    title: "Bảo mật tuyệt đối",
    desc: "Mã hóa đầu cuối, xác thực sinh trắc học, đáp ứng tiêu chuẩn ngân hàng",
    color: "bg-violet-100 text-violet-600",
  },
  {
    icon: TrendingUp,
    title: "Quản lý chi tiêu",
    desc: "Báo cáo thông minh, phân loại giao dịch tự động, giúp bạn tiết kiệm hơn",
    color: "bg-amber-100 text-amber-600",
  },
  {
    icon: Smartphone,
    title: "Ví điện tử thông minh",
    desc: "Giao diện đơn giản, thao tác nhanh chóng, phù hợp mọi lứa tuổi",
    color: "bg-sky-100 text-sky-600",
  },
];

const stats = [
  { label: "Người dùng tin tưởng", value: "2M+" },
  { label: "Giao dịch mỗi ngày", value: "500K+" },
  { label: "Giao dịch rủi ro đã chặn", value: "120K+" },
  { label: "Đối tác liên kết", value: "200+" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen bg-white w-full">
      {/* ===== TIỆN ÍCH VÀ DỊCH VỤ ===== */}
      <section className="pt-6 pb-6 bg-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-rose-600 mb-3">Tiện ích và dịch vụ</h2>
            <p className="text-slate-600 max-w-3xl mx-auto text-sm leading-relaxed">
              Ứng dụng tài chính Timi giúp bạn có thể tiếp cận nhiều dịch vụ tài chính đa dạng với chi phí hợp lý, để bạn làm được nhiều hơn với tiền.
            </p>
          </div>

          {/* Services Grid */}
          <div className="relative">
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide justify-start lg:justify-center snap-x">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <button
                    key={service.label}
                    onClick={() => user ? navigate("/dashboard") : navigate("/login")}
                    className="flex flex-col items-center gap-2 min-w-[72px] snap-start group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center group-hover:bg-rose-100 transition-colors">
                      <Icon className="w-6 h-6 text-rose-600" />
                    </div>
                    <span className="text-[11px] text-center text-slate-700 font-medium leading-tight max-w-[72px]">
                      {service.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags Pills */}
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {tags.map((tag) => {
              const Icon = tag.icon;
              return (
                <button
                  key={tag.label}
                  onClick={() => user ? navigate("/dashboard") : navigate("/login")}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-rose-200 bg-white text-rose-600 text-xs font-medium hover:bg-rose-50 transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== AI BANNER ===== */}
      <section className="py-8 bg-gradient-to-br from-pink-50 to-rose-50 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-pink-100">
            <div className="grid lg:grid-cols-2 gap-0">
              <div className="p-8 lg:p-12 flex flex-col justify-center">
                <h3 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-4 leading-snug">
                  Không chỉ là ví điện tử, Timi nay là <span className="text-rose-600">Trợ Thủ Tài Chính với AI</span>
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 text-sm text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Ứng dụng tài chính Timi giúp bạn có thể tiếp cận nhiều dịch vụ tài chính đa dạng với chi phí hợp lý, để bạn làm được nhiều hơn với tiền.</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Để ai cũng có thể làm được nhiều thứ hơn với tiền, kể cả những thứ nhỏ nhất.</span>
                  </li>
                  <li className="flex items-start gap-3 text-sm text-slate-600">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span>Với AI xuất hiện trong mọi tương tác nhỏ để giúp bảo vệ tiền của bạn, biến những công việc phức tạp về tiền trở nên đơn giản hay giúp bạn hiểu hơn về tài chính cá nhân mỗi ngày một chút.</span>
                  </li>
                </ul>
                <button
                  onClick={() => navigate("/dashboard")}
                  className="mt-6 self-start px-6 py-2.5 bg-gradient-to-r from-rose-500 to-pink-600 text-white text-sm font-bold rounded-full hover:shadow-lg transition-all"
                >
                  XEM NGAY
                </button>
              </div>
              <div className="relative bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center p-8 min-h-[300px]">
                <div className="absolute inset-0 bg-gradient-to-r from-rose-200 to-pink-200 rounded-full blur-3xl opacity-40" />
                <div className="relative bg-white rounded-[2rem] shadow-xl p-6 w-full max-w-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-slate-400">Số dư ví</p>
                      <p className="text-2xl font-bold text-slate-800">50.000.000 đ</p>
                    </div>
                    <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
                      <Shield className="w-5 h-5 text-rose-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="p-3 bg-rose-50 rounded-xl text-center">
                      <ArrowRightLeft className="w-5 h-5 text-rose-500 mx-auto mb-1" />
                      <p className="text-[10px] font-semibold text-slate-700">Chuyển tiền</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-xl text-center">
                      <CreditCard className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-[10px] font-semibold text-slate-700">Thanh toán</p>
                    </div>
                  </div>
                  <div className="p-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl text-white text-center">
                    <p className="text-xs font-bold">AI Anti-Scam đang bảo vệ</p>
                    <p className="text-[10px] text-emerald-100 mt-0.5">Đã quét và an toàn 100% giao dịch hôm nay</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white border-b border-slate-100 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl lg:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-600">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-slate-500 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 bg-slate-50/50 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">
              Mọi dịch vụ tài chính trong một ứng dụng
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Timi tích hợp đầy đủ tiện ích để bạn không cần cài nhiều app. Tất cả đều được bảo vệ bởi AI.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group bg-white rounded-3xl p-8 border border-slate-100 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-100/50 transition-all duration-300"
              >
                <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">{feature.title}</h3>
                <p className="text-slate-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Security Highlight */}
      <section id="security" className="py-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/20">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">Công nghệ độc quyền</span>
              </div>

              <h2 className="text-3xl lg:text-5xl font-bold leading-tight">
                AI Anti-Scam Agent
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-pink-400">
                  bảo vệ 24/7
                </span>
              </h2>

              <p className="text-slate-300 text-lg leading-relaxed">
                Hệ thống AI của Timi phân tích hành vi giao dịch, nhận diện mẫu lừa đảo và cảnh báo ngay lập tức trước khi tiền của bạn rời khỏi ví.
              </p>

              <div className="space-y-4 pt-4">
                {[
                  "Phát hiện giao dịch bất thường trong 50ms",
                  "Cơ sở dữ liệu scam cập nhật real-time",
                  "Xác thực đa lớp cho giao dịch lớn",
                  "Can thiệp AI thông minh khi phát hiện rủi ro",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex justify-end">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-pink-500 rounded-[3rem] blur-3xl opacity-20" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg">
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl">
                    <Shield className="w-8 h-8 text-red-400" />
                    <div>
                      <p className="font-bold text-red-200">Cảnh báo rủi ro cao!</p>
                      <p className="text-sm text-red-300">Tài khoản nhận nằm trong danh sách đen</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    <div>
                      <p className="font-bold text-emerald-200">Giao dịch an toàn</p>
                      <p className="text-sm text-emerald-300">Người nhận đã được xác minh</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
                    <Zap className="w-8 h-8 text-amber-400" />
                    <div>
                      <p className="font-bold text-amber-200">Yêu cầu xác nhận</p>
                      <p className="text-sm text-amber-300">Số tiền lớn hơn bình thường, vui lòng xác nhận</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-rose-50 to-pink-50 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 mb-6">
            Sẵn sàng bảo vệ ví tiền của bạn?
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            Tham gia cùng 2 triệu+ người dùng đang được Timi bảo vệ mỗi ngày. Đăng ký miễn phí, chỉ mất 30 giây.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/register")}
              className="px-10 py-4 bg-gradient-to-r from-rose-500 to-pink-600 text-white font-bold rounded-2xl shadow-xl shadow-rose-200 hover:shadow-2xl hover:scale-105 transition-all"
            >
              Tạo tài khoản miễn phí
            </button>
            <button
              onClick={() => navigate("/login")}
              className="px-10 py-4 bg-white text-slate-700 font-bold rounded-2xl border border-slate-200 hover:border-rose-300 hover:text-rose-600 transition-all"
            >
              Đã có tài khoản? Đăng nhập
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Timi</span>
              </div>
              <p className="text-sm leading-relaxed max-w-sm">
                Ví điện tử thông minh được bảo vệ bởi AI. Sứ mệnh của chúng tôi là giúp mọi giao dịch của bạn đều an toàn tuyệt đối.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Dịch vụ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-rose-400 transition-colors">Chuyển tiền</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Thanh toán hóa đơn</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Nạp điện thoại</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Quản lý chi tiêu</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Hỗ trợ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-rose-400 transition-colors">Trung tâm trợ giúp</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Chính sách bảo mật</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Điều khoản sử dụng</a></li>
                <li><a href="#" className="hover:text-rose-400 transition-colors">Liên hệ</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-sm text-center">
            © 2026 Timi. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </footer>
    </div>
  );
}