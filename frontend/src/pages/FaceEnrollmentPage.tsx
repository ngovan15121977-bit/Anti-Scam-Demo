import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { authApi } from "@/api/auth";
import FaceVerificationModal, { type FaceMatchResult } from "@/components/auth/FaceVerificationModal";
import { useAuthStore } from "@/stores/authStore";

export default function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const enroll = async (imageData: string): Promise<FaceMatchResult> => {
    setIsEnrolling(true);
    try {
      const result = await authApi.enrollFace(imageData);
      if (result.matched) navigate(user?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
      return result;
    } finally {
      setIsEnrolling(false);
    }
  };
  return <FaceVerificationModal onVerified={enroll} onCancel={() => navigate("/dashboard", { replace: true })} isLoading={isEnrolling} mode="enrollment" />;
}
