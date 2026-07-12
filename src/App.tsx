import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { StreakProvider } from "./context/StreakContext";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignUpPage,
} from "./pages/AuthPages";
import { OnboardingPage } from "./pages/Onboarding";
import { DashboardPage } from "./pages/Dashboard";
import { RoadmapPage } from "./pages/Roadmap";
import { ExplorePage } from "./pages/Explore";
import { ProfilePage } from "./pages/Profile";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <StreakProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute requireOnboarded>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roadmap"
            element={
              <ProtectedRoute requireOnboarded>
                <RoadmapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/explore"
            element={
              <ProtectedRoute requireOnboarded>
                <ExplorePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute requireOnboarded>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
        </Routes>
        {/* Floating on every page, signed in or not. */}
        <FeedbackWidget />
        </StreakProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
