import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export default function ProtectedRoute({ children, requireAdmin = false }: { 
  children: React.ReactNode; 
  requireAdmin?: boolean;
}) {
  const { isAuthenticated, isAdmin } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    // Keep deep-link (/transfer?token=…) so after login user lands on transfer prefilled.
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: redirect === "/" ? "/dashboard" : redirect }}
      />
    );
  }
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
