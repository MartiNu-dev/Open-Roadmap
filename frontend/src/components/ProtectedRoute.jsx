import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation("common");
  const location = useLocation();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("loading")}</div>;
  }
  if (!user) {
    const fromState = { from: location.pathname };
    return <Navigate to="/login" replace state={fromState} />;
  }
  return children;
}
