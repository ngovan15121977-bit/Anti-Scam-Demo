import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { useAuthStore } from "@/stores/authStore";
import PageTransition from "@/components/transitions/PageTransition";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import HomePage from "@/pages/HomePage";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LocationRequiredRoute from "@/components/auth/LocationRequiredRoute";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const TransferPage = lazy(() => import("@/pages/TransferPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const PinSetupPage = lazy(() => import("@/pages/PinSetupPage"));
const LocationSetupPage = lazy(() => import("@/pages/LocationSetupPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/FaceEnrollmentPage"));
const QrPaymentPage = lazy(() => import("@/pages/QrPaymentPage"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { token, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, []);

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <>{children}</>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          {/* PageTransition wrap toàn bộ Routes — logo reveal mỗi lần chuyển trang */}
          <PageTransition>
            <Suspense
              fallback={
                <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
                  {/* Fallback tối giản — overlay của PageTransition sẽ che phủ */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-rose-200 border-t-rose-500" />
                    <p className="text-sm font-medium text-gray-400">
                      Đang tải...
                    </p>
                  </div>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <LoginPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicOnlyRoute>
                      <RegisterPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <PublicOnlyRoute>
                      <ForgotPasswordPage />
                    </PublicOnlyRoute>
                  }
                />

                <Route
                  element={
                    <ProtectedRoute>
                      <LocationRequiredRoute>
                        <MainLayout />
                      </LocationRequiredRoute>
                    </ProtectedRoute>
                  }
                >
                  <Route path="/confirm-location" element={<LocationSetupPage />} />
                  <Route path="/setup-pin" element={<PinSetupPage />} />
                  <Route path="/setup-face" element={<FaceEnrollmentPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/transfer" element={<TransferPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/me" element={<ProfilePage />} />
                  <Route path="/qr" element={<QrPaymentPage />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requireAdmin>
                        <AdminPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </AuthInitializer>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;