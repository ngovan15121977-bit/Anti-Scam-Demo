import { Navigate, useLocation } from "react-router-dom";

import { hasConfirmedLoginLocation } from "@/lib/riskTelemetry";
import { useAuthStore } from "@/stores/authStore";

/** Keep the app behind the required post-login location setup screen. */
export default function LocationRequiredRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, token } = useAuthStore();

  if (
    isAuthenticated
    && token
    && location.pathname !== "/confirm-location"
    && !hasConfirmedLoginLocation(token)
  ) {
    return (
      <Navigate
        to="/confirm-location"
        replace
        state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <>{children}</>;
}
