import { useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { friendlyError } from "../lib/messages";
import { logEvent } from "../lib/analytics";
import { cleanText } from "../lib/sanitize";

/**
 * Floating feedback button, present on every page (signed in or not).
 * Submissions go through the rate-limited `submit_feedback` SECURITY DEFINER
 * RPC — the feedback table itself accepts no direct client reads or writes.
 */
export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const panelRef = useRef<HTMLFormElement | null>(null);

  if (["/login", "/signup"].includes(location.pathname)) return null;

  const close = () => {
    setOpen(false);
    setRating(0);
    setMessage("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (rating < 1 || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_feedback", {
      p_page: location.pathname.slice(0, 80),
      p_rating: rating,
      p_message: cleanText(message, 1000) || null,
    });
    setBusy(false);
    if (error) {
      toast(friendlyError(error, "Couldn't send your feedback. Please try again."), "error");
      return;
    }
    if (user) logEvent("feedback_submitted", { rating, page: location.pathname });
    toast("Thanks for the feedback");
    close();
  };

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open && (
        <form
          ref={panelRef}
          onSubmit={submit}
          onKeyDown={(e) => e.key === "Escape" && close()}
          aria-label="Send feedback"
          className="reveal w-72 rounded-2xl border border-mist bg-card p-4 shadow-lift"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Quick feedback</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close feedback form"
              className="rounded-md p-1 text-fog transition-colors hover:text-pine"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="mt-0.5 text-xs text-fog">How is SkillVerse so far?</p>

          <div
            role="radiogroup"
            aria-label="Rating from 1 to 5"
            className="mt-3 flex justify-between"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                className={`pop flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all ${
                  n <= rating
                    ? "border-marigold bg-marigold-tint"
                    : "border-mist bg-paper hover:border-marigold/50"
                }`}
              >
                <StarIcon filled={n <= rating} />
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Anything we should know? (optional)"
            aria-label="Feedback message"
            className="field mt-3 resize-none !py-2.5 text-sm"
          />

          <button
            type="submit"
            disabled={rating < 1 || busy}
            className="btn-primary mt-3 w-full !py-2.5 text-sm"
          >
            {busy ? "Sending…" : "Send feedback"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-abyss px-4 py-2.5 text-sm font-medium text-glow shadow-lift transition-all hover:bg-abyss-soft active:scale-[0.97]"
      >
        <ChatIcon />
        Feedback
      </button>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "#EDA419" : "none"}
      stroke={filled ? "#EDA419" : "#6C8078"}
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m12 3 2.7 5.9 6.3.6-4.8 4.3 1.4 6.2L12 16.8 6.4 20l1.4-6.2L3 9.5l6.3-.6L12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
    </svg>
  );
}
