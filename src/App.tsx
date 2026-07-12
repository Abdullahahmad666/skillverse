import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { StreakProvider } from "./context/StreakContext";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { LoadingScreen } from "./components/LoadingScreen";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignUpPage,
} from "./pages/AuthPages";
import { LandingPage } from "./pages/Landing";
import { OnboardingPage } from "./pages/Onboarding";
import { DashboardPage } from "./pages/Dashboard";
import { RoadmapPage } from "./pages/Roadmap";
import { ExplorePage } from "./pages/Explore";
import { ProfilePage } from "./pages/Profile";

/** Root: signed-in users get the dashboard, visitors get the landing page. */
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <LandingPage />;
  return (
    <ProtectedRoute requireOnboarded>
      <DashboardPage />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
        <StreakProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/about" element={<LandingPage />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<RootRoute />} />
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
      </ThemeProvider>
    </BrowserRouter>
  );
}
