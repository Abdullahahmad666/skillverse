import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { friendlyError } from "../lib/messages";
import { logEvent } from "../lib/analytics";
import { cleanText } from "../lib/sanitize";
import type { Review } from "../lib/types";
import { Reveal } from "./Reveal";

/**
 * Landing-page "Wall of love": two rows of testimonial cards drifting in
 * opposite directions (pause on hover), plus a form to add your own.
 *
 * Reviews are PUBLIC and live. They're read from the public.reviews table and
 * new ones arrive in real time over Supabase Realtime, so every visitor sees
 * honest reviews as they're posted. Writes go only through the rate-limited,
 * sanitizing submit_review() RPC (migration 0008) — clients cannot write the
 * table directly. Posting optimistically prepends your card; the realtime
 * echo is de-duplicated by id.
 */

const ACCENTS = ["jade", "marigold", "violet"] as const;
type Accent = (typeof ACCENTS)[number];

const ACCENT: Record<Accent, { ring: string; text: string; bg: string }> = {
  jade: { ring: "border-jade/40", text: "text-jade", bg: "bg-jade/15" },
  marigold: { ring: "border-marigold/40", text: "text-marigold", bg: "bg-marigold/15" },
  violet: { ring: "border-[#a897ff]/40", text: "text-[#a897ff]", bg: "bg-[#a897ff]/15" },
};

// Stable per-review hash — decides row placement and accent so a card never
// jumps rows or changes colour when new reviews are prepended.
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

type ReviewRow = Record<string, unknown>;
function mapRow(row: ReviewRow): Review {
  return {
    id: String(row.id),
    display_name: String(row.display_name ?? ""),
    rating: Number(row.rating ?? 5),
    message: String(row.message ?? ""),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function Testimonials() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<Review[]>([]);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Keep the name field in sync once the profile loads (for signed-in users).
  useEffect(() => {
    if (profile?.display_name) setName((n) => n || profile.display_name!);
  }, [profile?.display_name]);

  // Initial load + realtime subscription for live reviews.
  useEffect(() => {
    let active = true;

    void supabase
      .from("reviews")
      .select("id, display_name, rating, message, created_at")
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (active && data) setItems(data.map(mapRow));
      });

    const channel = supabase
      .channel("reviews-wall")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reviews" },
        (payload) => {
          const review = mapRow(payload.new as ReviewRow);
          setItems((prev) =>
            prev.some((r) => r.id === review.id) ? prev : [review, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  // Two disjoint rows by stable hash parity — top and bottom never show the
  // same review. A freshly posted card sits at the front of its row.
  const [rowTop, rowBottom] = useMemo(() => {
    const top: Review[] = [];
    const bottom: Review[] = [];
    for (const r of items) (hashId(r.id) % 2 === 0 ? top : bottom).push(r);
    // If everything hashed to one side (tiny dataset), mirror so both animate.
    if (top.length === 0) return [bottom, bottom];
    if (bottom.length === 0) return [top, top];
    return [top, bottom];
  }, [items]);

  const cleanName = cleanText(name, 60);
  const cleanMessage = cleanText(message, 1000);
  const canSubmit = rating >= 1 && cleanName.length >= 2 && cleanMessage.length >= 4 && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    const { data, error } = await supabase.rpc("submit_review", {
      p_name: cleanName,
      p_rating: rating,
      p_message: cleanMessage,
    });
    setBusy(false);
    if (error) {
      toast(friendlyError(error, "Couldn't post your review. Please try again."), "error");
      return;
    }

    // Optimistic prepend using the row the RPC returned (realtime echo is
    // de-duplicated by id in the subscription handler above).
    if (data) {
      const review = mapRow(data as ReviewRow);
      setItems((prev) => (prev.some((r) => r.id === review.id) ? prev : [review, ...prev]));
    }
    if (user) logEvent("feedback_submitted", { rating, page: "/" });
    toast("Thanks — your review is live on the wall ✨");
    setRating(0);
    setMessage("");
  };

  return (
    <section id="wall" aria-labelledby="wall-title" className="scroll-mt-20 py-16">
      <div className="mx-auto max-w-5xl px-4">
        <Reveal>
          <p className="eyebrow !text-jade">Wall of love</p>
          <h2 id="wall-title" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">
            Learners, in their own words
          </h2>
          <p className="mt-2 max-w-xl text-white/65">
            Honest, unedited reviews from people who started exactly where you
            are — posted live. Add yours and it appears on the wall for everyone,
            instantly.
          </p>
        </Reveal>
      </div>

      {/* The moving wall: two rows, opposite directions, pause on hover. */}
      {items.length > 0 && (
        <div className="group mt-10 flex flex-col gap-4">
          <div className="marquee">
            <div className="marquee-track gap-4 pl-4 group-hover:[animation-play-state:paused]">
              {[...rowTop, ...rowTop].map((t, i) => (
                <TestimonialCard key={`top-${i}-${t.id}`} review={t} duplicate={i >= rowTop.length} />
              ))}
            </div>
          </div>
          <div className="marquee">
            <div
              className="marquee-track marquee-reverse gap-4 pl-4 group-hover:[animation-play-state:paused]"
              style={{ ["--marquee-dur" as string]: "58s" }}
            >
              {[...rowBottom, ...rowBottom].map((t, i) => (
                <TestimonialCard key={`bot-${i}-${t.id}`} review={t} duplicate={i >= rowBottom.length} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add-your-own form */}
      <div className="mx-auto mt-10 max-w-5xl px-4">
        <Reveal>
          <form onSubmit={submit} aria-label="Share your experience" className="glass mx-auto max-w-2xl p-6 sm:p-7">
            <h3 className="font-display text-xl font-bold text-white">Share your experience</h3>
            <p className="mt-1 text-sm text-white/60">
              Rate SkillVerse and leave a note — your review goes live on the wall for everyone.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-white/80">Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  placeholder="e.g. Ayesha Khan"
                  className="field !bg-white/5 !text-white placeholder:!text-white/40"
                />
              </label>

              <div className="block">
                <span className="mb-1.5 block text-sm font-medium text-white/80">Your rating</span>
                <div role="radiogroup" aria-label="Rating from 1 to 5" className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`${n} star${n === 1 ? "" : "s"}`}
                      onClick={() => setRating(n)}
                      className={`pop flex h-11 w-11 items-center justify-center rounded-lg border transition-all ${
                        n <= rating
                          ? "border-marigold bg-marigold/15"
                          : "border-white/15 bg-white/5 hover:border-marigold/50"
                      }`}
                    >
                      <StarIcon filled={n <= rating} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-medium text-white/80">Your review</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                required
                placeholder="What's working for you so far?"
                className="field !resize-none !bg-white/5 !text-white placeholder:!text-white/40"
              />
            </label>

            <button type="submit" disabled={!canSubmit} className="btn-primary mt-4 w-full !py-3">
              {busy ? "Posting…" : "Post to the wall"}
            </button>
            {!busy && (
              <p className="mt-2 text-center text-xs text-white/50">
                {canSubmit
                  ? "You can post up to 5 reviews per hour."
                  : `Add ${[
                      cleanName.length < 2 && "your name",
                      rating < 1 && "a rating",
                      cleanMessage.length < 4 && "a short review",
                    ]
                      .filter(Boolean)
                      .join(", ")} to post.`}
              </p>
            )}
          </form>
        </Reveal>
      </div>
    </section>
  );
}

function TestimonialCard({ review, duplicate }: { review: Review; duplicate: boolean }) {
  const a = ACCENT[ACCENTS[hashId(review.id) % ACCENTS.length]];
  return (
    <figure aria-hidden={duplicate} className="glass flex w-[19rem] flex-none flex-col p-5">
      <div className="flex items-center gap-1" aria-label={`${review.rating} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled={n <= review.rating} small />
        ))}
      </div>
      <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-white/80">
        “{review.message}”
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border font-display text-sm font-bold ${a.ring} ${a.bg} ${a.text}`}
        >
          {review.display_name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{review.display_name}</span>
          <span className="block truncate font-mono text-[11px] text-white/55">{relativeTime(review.created_at)}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function StarIcon({ filled, small }: { filled: boolean; small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={filled ? "#F2B13E" : "none"}
      stroke={filled ? "#F2B13E" : "#86A095"}
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="m12 3 2.7 5.9 6.3.6-4.8 4.3 1.4 6.2L12 16.8 6.4 20l1.4-6.2L3 9.5l6.3-.6L12 3Z" strokeLinejoin="round" />
    </svg>
  );
}
