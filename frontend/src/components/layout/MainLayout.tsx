import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Home, Send, History, User, LogOut, QrCode, ShieldCheck } from "lucide-react";
import MiniTimiAssistant from "@/components/ai/MiniTimiAssistant";
import ScamGuardianAlert from "@/components/guardian/ScamGuardianAlert";
import { ScamGuardianProvider } from "@/components/guardian/ScamGuardianProvider";

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const navItems = [
    { path: "/dashboard", label: "Trang chủ", icon: Home },
    { path: "/transfer", label: "Chuyển tiền", icon: Send },
    { path: "/qr", label: "QR", icon: QrCode },
    { path: "/history", label: "Lịch sử", icon: History },
    ...(isAdmin ? [{ path: "/admin", label: "Admin", icon: ShieldCheck }] : []),
    { path: "/me", label: "Tài khoản", icon: User },
  ];

  return (
    <ScamGuardianProvider>
      <div className="min-h-screen bg-gray-50 w-full">
      {/* Top Navbar — Full Width */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-rose-500 to-pink-600 rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
              Timi Banking
            </span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-rose-50 text-rose-600 shadow-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex items-center justify-around z-50">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  isActive ? "text-rose-600" : "text-gray-400"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Content — Full Width, NO max-w-7xl */}
      <main className="w-full pb-20 sm:pb-0">
        <Outlet />
      </main>
      <MiniTimiAssistant />
      <ScamGuardianAlert />
      </div>
    </ScamGuardianProvider>
  );
}
