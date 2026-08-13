import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/authStore";

/** Redirect any signed-in account without a PIN before it can use the app. */
export default function PinSetupEnforcer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const pinStatus = useQuery({
    queryKey: ["transaction-pin-status"],
    queryFn: authApi.transactionPinStatus,
    enabled: isAuthenticated,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (
      isAuthenticated
      && pinStatus.isSuccess
      && !pinStatus.data.configured
      && location.pathname !== "/setup-pin"
    ) {
      navigate("/setup-pin", { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate, pinStatus.data, pinStatus.isSuccess]);

  return null;
}
