import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { Shield, LayoutDashboard, Send, History, LogOut, User, ShieldAlert } from "lucide-react";

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuthStore();

  const handleLogout = () => { logout(); navigate("/login"); };

  const navItems = [
    { path: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { path: "/transfer", label: "Chuyển tiền", icon: Send },
    { path: "/history", label: "Lịch sử", icon: History },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary-100 p-2 rounded-lg"><Shield className="h-6 w-6 text-primary-600" /></div>
              <span className="text-lg font-bold text-gray-900 hidden sm:block">Anti-Scam Agent</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                <User className="h-4 w-4" />
                <span className="font-medium">{user?.full_name}</span>
                <span className="text-gray-400">|</span>
                <span className="font-semibold text-primary-600">{user?.balance?.toLocaleString("vi-VN")} VND</span>
              </div>
              <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Đăng xuất">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 flex-shrink-0">
            <nav className="card p-2 space-y-1 sticky top-24">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50"}`}>
                    <Icon className="h-5 w-5" />{item.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link to="/admin" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${location.pathname === "/admin" ? "bg-purple-50 text-purple-700" : "text-gray-700 hover:bg-gray-50"}`}>
                  <ShieldAlert className="h-5 w-5" />Quản trị
                </Link>
              )}
            </nav>
          </aside>
          <main className="flex-1 min-w-0"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}