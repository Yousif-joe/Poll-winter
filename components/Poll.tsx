"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase, type PollOption } from "@/lib/supabase";

const STORAGE_KEY = "seasons-poll-vote";

// Fixed display order; DB rows are matched onto this.
const SEASONS: PollOption[] = [
  { id: "spring", label: "Spring", votes: 0 },
  { id: "summer", label: "Summer", votes: 0 },
  { id: "autumn", label: "Autumn", votes: 0 },
  { id: "winter", label: "Winter", votes: 0 },
];
const SEASON_IDS = new Set(SEASONS.map((s) => s.id));

function readStoredVote(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && SEASON_IDS.has(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStoredVote(value: string | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.) — vote still counts server-side.
  }
}

export default function Poll() {
  const [options, setOptions] = useState<PollOption[]>(SEASONS);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyRows = useCallback((rows: PollOption[]) => {
    setOptions((prev) =>
      prev.map((o) => {
        const row = rows.find((r) => r.id === o.id);
        return row ? { ...o, label: row.label, votes: row.votes } : o;
      }),
    );
  }, []);

  // Read this device's vote after mount (localStorage isn't available on the server)
  // and keep other tabs on the same device in sync.
  useEffect(() => {
    setMyVote(readStoredVote());
    setMounted(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMyVote(readStoredVote());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Initial fetch + realtime subscription.
  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchCounts = async () => {
      const { data, error } = await supabase
        .from("poll_options")
        .select("id,label,votes");
      if (cancelled) return;
      if (error) {
        setError("Couldn't load results. Please refresh.");
      } else if (data) {
        applyRows(data as PollOption[]);
        setError(null);
      }
      setLoading(false);
    };

    const channel = supabase
      .channel("poll_options_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "poll_options" },
        (payload) => applyRows([payload.new as PollOption]),
      )
      .subscribe((status) => {
        if (cancelled) return;
        setLive(status === "SUBSCRIBED");
        // (Re)fetch whenever we (re)connect so no update is missed.
        if (status === "SUBSCRIBED") fetchCounts();
      });

    fetchCounts();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [applyRows]);

  const vote = async (id: string) => {
    if (myVote || submitting) return;
    setSubmitting(true);
    setError(null);

    // Optimistic: lock the device and bump the count immediately.
    // Realtime then delivers the authoritative absolute count.
    writeStoredVote(id);
    setMyVote(id);
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o)),
    );

    const { error } = await getSupabase().rpc("increment_vote", {
      option_id: id,
    });

    if (error) {
      // Roll back so the user can try again.
      writeStoredVote(null);
      setMyVote(null);
      setOptions((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, votes: Math.max(0, o.votes - 1) } : o,
        ),
      );
      setError("Your vote didn't go through. Please try again.");
    }
    setSubmitting(false);
  };

  const total = options.reduce((sum, o) => sum + o.votes, 0);
  const pct = (votes: number) => (total === 0 ? 0 : (votes / total) * 100);
  const showButtons = mounted && !myVote;

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-10">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-stone-400">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              live ? "animate-pulse bg-emerald-500" : "bg-stone-300"
            }`}
            aria-hidden
          />
          {live ? "Live results" : "Connecting…"}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          What&rsquo;s your favorite season?
        </h1>
        {mounted && myVote && (
          <p className="mt-2 text-sm text-stone-500">
            Thanks for voting! Results update in real time.
          </p>
        )}
      </header>

      {showButtons && (
        <div className="mb-10 grid grid-cols-2 gap-3">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => vote(o.id)}
              disabled={submitting || loading}
              className="rounded-2xl border border-stone-200 px-4 py-3.5 text-base font-medium text-stone-800 transition hover:border-accent hover:bg-accent/5 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-5" aria-live="polite">
        {options.map((o) => {
          const p = pct(o.votes);
          const mine = myVote === o.id;
          return (
            <li key={o.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium text-stone-800">
                  {o.label}
                  {mine && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Your vote
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-stone-500">
                  {o.votes.toLocaleString()}{" "}
                  <span className="text-stone-400">·</span>{" "}
                  <span className="font-medium text-stone-700">
                    {Math.round(p)}%
                  </span>
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-stone-100"
                role="progressbar"
                aria-label={`${o.label} ${Math.round(p)} percent`}
                aria-valuenow={Math.round(p)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    mine ? "bg-accent" : "bg-accent/45"
                  }`}
                  style={{ width: `${p}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="mt-8 flex items-center justify-between border-t border-stone-100 pt-5 text-sm text-stone-400">
        <span className="tabular-nums">
          {loading ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "vote" : "votes"}`}
        </span>
        <span>One vote per device</span>
      </footer>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
