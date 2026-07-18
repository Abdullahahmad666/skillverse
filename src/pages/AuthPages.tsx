import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { GENERIC_ERROR, signupError, USERNAME_TAKEN } from "../lib/messages";
import { logEvent } from "../lib/analytics";
import {
  cleanText,
  validateEmail,
  validatePassword,
  validateUsername,
} from "../lib/sanitize";

/* ---------- shared layout ---------- */

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="reveal w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2">
            <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#173B33" />
              <path
                d="M10 22V10h4.5a4 4 0 0 1 0 8H12"
                stroke="#EDA419"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
              <circle cx="21" cy="21" r="3" fill="#0E8A62" />
            </svg>
            <span className="font-display text-xl font-bold">SkillVerse</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-fog">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-card p-6 shadow-card">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-fog">
          New around here?{" "}
          <Link to="/about" className="font-medium text-jade-deep hover:underline">
            See what SkillVerse is
          </Link>
        </p>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-lg bg-jade-tint px-3 py-2 text-sm text-jade-deep">
      {message}
    </p>
  );
}

const AUTH_REDIRECT_KEY = "sv-auth-redirect";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AuthDivider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-mist" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-fog">or</span>
      </div>
    </div>
  );
}

function ContinueWithGoogleButton({
  disabled,
  redirectTarget,
  setError,
  setOauthBusy,
}: {
  disabled: boolean;
  redirectTarget: string;
  setError: (message: string | null) => void;
  setOauthBusy: (busy: boolean) => void;
}) {
  const location = useLocation();

  const click = async () => {
    setError(null);
    setOauthBusy(true);
    sessionStorage.setItem(AUTH_REDIRECT_KEY, redirectTarget);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${location.pathname}`,
      },
    });
    if (error) {
      console.error(error);
      setOauthBusy(false);
      setError(GENERIC_ERROR);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void click()}
      className="btn-ghost w-full"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

function authRedirectTarget(location: ReturnType<typeof useLocation>): string {
  return (
    sessionStorage.getItem(AUTH_REDIRECT_KEY) ??
    (location.state as { from?: string } | null)?.from ??
    "/"
  );
}

/* ---------- Login ---------- */

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  const from = authRedirectTarget(location);

  useEffect(() => {
    if (!loading && user) {
      sessionStorage.removeItem(AUTH_REDIRECT_KEY);
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailErr = validateEmail(email.trim());
    if (emailErr) return setError(emailErr);

    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      // Anti-enumeration: the same message whether the email is unknown or
      // the password is wrong. Real cause goes to the console only.
      console.error(authError);
      setError(
        authError.name === "AuthRetryableFetchError"
          ? GENERIC_ERROR
          : "Invalid email or password.",
      );
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Pick up your learning where you left off.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <div>
          <label htmlFor="email" className="eyebrow mb-1.5 block">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="eyebrow">Password</label>
            <Link to="/forgot-password" className="text-xs font-medium text-jade-deep hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={busy || oauthBusy} className="btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <AuthDivider />
        <ContinueWithGoogleButton
          disabled={busy || oauthBusy}
          redirectTarget={(location.state as { from?: string } | null)?.from ?? "/"}
          setError={setError}
          setOauthBusy={setOauthBusy}
        />
      </form>
      <p className="mt-5 text-center text-sm text-fog">
        New here?{" "}
        <Link to="/signup" className="font-medium text-jade-deep hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

/* ---------- Sign up ---------- */

export function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      sessionStorage.removeItem(AUTH_REDIRECT_KEY);
      navigate(authRedirectTarget(location), { replace: true });
    }
  }, [user, loading, navigate, location]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const uname = cleanText(username, 20);
    const err =
      validateUsername(uname) ??
      validateEmail(email.trim()) ??
      validatePassword(password);
    if (err) return setError(err);

    setBusy(true);
    const { data: usernameAvailable, error: usernameCheckError } = await supabase.rpc(
      "username_is_available",
      { p_username: uname },
    );
    if (!usernameCheckError && usernameAvailable === false) {
      setBusy(false);
      return setError(USERNAME_TAKEN);
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: uname, display_name: uname } },
    });
    setBusy(false);

    if (authError) {
      setError(signupError(authError));
      return;
    }

    // If email confirmation is on, there's no session yet (the signup event
    // is then skipped — log_event requires an authenticated session).
    if (!data.session) {
      setInfo("Check your inbox — confirm your email, then sign in.");
      return;
    }
    logEvent("signup");
    navigate("/onboarding", { replace: true });
  };

  return (
    <AuthLayout
      title="Start your first skill"
      subtitle="One roadmap, vetted free resources, no more guessing where to start."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <FormSuccess message={info} />
        <div>
          <label htmlFor="username" className="eyebrow mb-1.5 block">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            className="field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="learner_01"
            maxLength={20}
          />
        </div>
        <div>
          <label htmlFor="new-email" className="eyebrow mb-1.5 block">Email</label>
          <input
            id="new-email"
            type="email"
            autoComplete="email"
            required
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="new-password" className="eyebrow mb-1.5 block">Password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <button type="submit" disabled={busy || oauthBusy} className="btn-primary w-full">
          {busy ? "Creating account…" : "Create account"}
        </button>
        <AuthDivider />
        <ContinueWithGoogleButton
          disabled={busy || oauthBusy}
          redirectTarget="/"
          setError={setError}
          setOauthBusy={setOauthBusy}
        />
      </form>
      <p className="mt-5 text-center text-sm text-fog">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-jade-deep hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

/* ---------- Forgot password ---------- */

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailErr = validateEmail(email.trim());
    if (emailErr) return setError(emailErr);

    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    setBusy(false);
    // Anti-enumeration: identical outcome whether or not the email exists.
    // A failure here (e.g. rate limit) is logged, never surfaced differently.
    if (resetError) console.error(resetError);
    setInfo("If that email is registered, you'll get a reset link.");
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <FormSuccess message={info} />
        <div>
          <label htmlFor="reset-email" className="eyebrow mb-1.5 block">Email</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-fog">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-jade-deep hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

/* ---------- Reset password (arrived via email link) ---------- */

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // The email link signs the user into a recovery session.
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const pwErr = validatePassword(password);
    if (pwErr) return setError(pwErr);
    if (password !== confirm) return setError("Passwords don't match.");

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      console.error(updateError);
      setError("Couldn't save your new password. Request a fresh reset link and try again.");
      return;
    }
    toast("Password updated");
    navigate("/", { replace: true });
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="You're almost back in.">
      {!ready ? (
        <p className="text-sm text-fog">
          Waiting for your reset link… Open this page from the link in your
          email. If nothing happens,{" "}
          <Link to="/forgot-password" className="font-medium text-jade-deep hover:underline">
            request a new link
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <div>
            <label htmlFor="np" className="eyebrow mb-1.5 block">New password</label>
            <input
              id="np"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label htmlFor="cp" className="eyebrow mb-1.5 block">Confirm password</label>
            <input
              id="cp"
              type="password"
              autoComplete="new-password"
              required
              className="field"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
            />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
