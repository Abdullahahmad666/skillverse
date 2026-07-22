import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { StreakProvider } from "./context/StreakContext";
import { FeedbackWidget } from "./components/FeedbackWidget";
import { LoadingScreen } from "./components/LoadingScreen";
import { ProtectedRoute } from "./components/ProtectedRoute";
// Landing is the first paint for every cold/unauthenticated visitor, so it is
// imported EAGERLY (part of the initial bundle). Lazy-loading it would add a
// network round-trip before first paint. The authenticated app pages below
// stay lazy so their weight never touches the landing critical path.
import { LandingPage } from "./pages/Landing";

// Route-level code splitting for the authenticated app: each page ships as its
// own chunk, loaded only when visited. Pages use named exports, so we map them
// onto the default export React.lazy expects.
const LoginPage = lazy(() => import("./pages/AuthPages").then((m) => ({ default: m.LoginPage })));
const SignUpPage = lazy(() => import("./pages/AuthPages").then((m) => ({ default: m.SignUpPage })));
const ForgotPasswordPage = lazy(() =>
  import("./pages/AuthPages").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/AuthPages").then((m) => ({ default: m.ResetPasswordPage })),
);
const OnboardingPage = lazy(() =>
  import("./pages/Onboarding").then((m) => ({ default: m.OnboardingPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })),
);
const RoadmapPage = lazy(() => import("./pages/Roadmap").then((m) => ({ default: m.RoadmapPage })));
const ExplorePage = lazy(() => import("./pages/Explore").then((m) => ({ default: m.ExplorePage })));
const ProfilePage = lazy(() => import("./pages/Profile").then((m) => ({ default: m.ProfilePage })));

/** Whether Supabase has a persisted session in localStorage (sync check). */
function hasCachedSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.includes("-auth-token")) return true;
    }
  } catch {
    /* localStorage unavailable — treat as logged out */
  }
  return false;
}

/** Root: signed-in users get the dashboard, visitors get the landing page. */
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    // While the session restores: with no cached session it's almost certainly
    // a logged-out visitor, so render the landing immediately — this matches
    // the prerendered hero shell in index.html for a seamless, flash-free
    // handoff. With a cached session, show the loader until it resolves.
    return hasCachedSession() ? <LoadingScreen /> : <LandingPage />;
  }
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
        <Suspense fallback={<LoadingScreen />}>
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
        </Suspense>
        {/* Floating on every page, signed in or not. */}
        <FeedbackWidget />
        </StreakProvider>
        </ToastProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
