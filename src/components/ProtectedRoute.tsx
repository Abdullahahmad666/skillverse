import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "./LoadingScreen";

interface Props {
  children: ReactNode;
  /** When true, users without a chosen skill are sent to onboarding. */
  requireOnboarded?: boolean;
}

export function ProtectedRoute({ children, requireOnboarded = false }: Props) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireOnboarded && profile && !profile.current_skill_id) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
