"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import type { SubmissionDetail, ReviewAsset } from "@/lib/submissions/getSubmission";
import {
  setPageType,
  setAssetVisibility,
  setSubmissionThumbnail,
  type PageType,
} from "@/lib/actions/mutations";
import { postDecision, retryDecision, setSubmissionLabel } from "@/lib/actions/review";
import {
  COMMENT_MAX,
  DECISIONS,
  decisionLabel,
  formatNoteText,
  latestDecisionPerReviewer,
  type Decision,
} from "@/lib/reviewer/decisions";
import { displayStatus } from "@/lib/submittable/statuses";
import { formatDate, formatDateTime } from "@/lib/format";
import { DECISION_TONE, DecisionChip } from "@/components/review/DecisionChip";

const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: "artwork", label: "Artwork" },
  { value: "cover_statement", label: "Cover / statement" },
  { value: "cv_bio", label: "CV / bio" },
  { value: "contact_sheet", label: "Contact sheet" },
  { value: "unknown", label: "Unknown" },
];

interface QueueItem {
  id: string;
  artistName: string | null;
  submissionTitle: string | null;
  myDecision: string | null;
}

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const btn = "w-8 h-8 bg-bg/80 border border-border text-text hover:border-accent text-sm";
  return (
    <div className="absolute bottom-3 right-3 flex gap-1 z-10">
      <button type="button" onClick={() => zoomOut()} className={btn} aria-label="Zoom out">
        −
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className={`${btn} text-xs`}
        aria-label="Fit"
      >
        Fit
      </button>
      <button type="button" onClick={() => zoomIn()} className={btn} aria-label="Zoom in">
        +
      </button>
    </div>
  );
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}

export function SubmissionReviewClient({
  submission,
  lastSynced,
  queue,
  position,
  query,
  reviewer,
  labelCatalog,
}: {
  submission: SubmissionDetail;
  lastSynced: string;
  queue: QueueItem[];
  position: { index: number; total: number; prevId: string | null; nextId: string | null };
  query: string;
  reviewer: { id: string; name: string };
  labelCatalog: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const asset: ReviewAsset | undefined = submission.assets[pageIndex];
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const go = useCallback(
    (id: string | null) => {
      if (id) router.push(`/submissions/${id}${query}`);
    },
    [router, query],
  );

  // Keyboard: J/K submissions, ←/→ pages, 1–3 decision. Ignored while typing,
  // except ⌘/Ctrl+Enter, which the form handles itself.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      const n = submission.assets.length;
      if (e.key === "j") go(position.nextId);
      else if (e.key === "k") go(position.prevId);
      else if (e.key === "ArrowRight" && n > 1) setPageIndex((i) => Math.min(n - 1, i + 1));
      else if (e.key === "ArrowLeft" && n > 1) setPageIndex((i) => Math.max(0, i - 1));
      else if (e.key === "1" || e.key === "2" || e.key === "3") {
        setDecision(DECISIONS[Number(e.key) - 1].value);
        e.preventDefault();
        commentRef.current?.focus();
      } else if (e.key === "?") setShowHelp((s) => !s);
      else if (e.key === "Escape") setShowHelp(false);
      else return;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, position.nextId, position.prevId, submission.assets.length]);

  const fileOf = submission.files.find((f) => f.id === asset?.submissionFileId);
  const listHref = `/submissions${query}`;

  return (
    <div className="lg:h-screen bg-bg text-text flex flex-col lg:overflow-hidden">
      {/* Top bar: where you are in the queue, and how to move through it */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-4 shrink-0 text-sm">
        <Link href={listHref} className="text-text-muted hover:text-text whitespace-nowrap">
          ← Review list
        </Link>
        <span className="text-text-muted tabular-nums whitespace-nowrap">
          {position.index >= 0 ? `${position.index + 1} of ${position.total}` : "Not in this list"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => go(position.prevId)}
            disabled={!position.prevId}
            className="border border-border px-2.5 py-1 hover:border-accent disabled:opacity-30"
            title="Previous submission (K)"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => go(position.nextId)}
            disabled={!position.nextId}
            className="border border-border px-2.5 py-1 hover:border-accent disabled:opacity-30"
            title="Next submission (J)"
          >
            Next
          </button>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-text-muted">
          <span className="hidden md:inline">Synced {lastSynced}</span>
          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            className="hover:text-text"
            aria-expanded={showHelp}
          >
            Shortcuts
          </button>
          <Link href="/reviewer?switch=1" className="hover:text-text" title="Switch reviewer">
            {reviewer.name}
          </Link>
        </div>
      </header>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Queue */}
        <aside
          className="w-60 border-r border-border overflow-y-auto shrink-0 hidden xl:block"
          aria-label="Review list"
        >
          <ol>
            {queue.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/submissions/${item.id}${query}`}
                  aria-current={item.id === submission.id ? "page" : undefined}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-border text-sm ${
                    item.id === submission.id
                      ? "bg-surface text-text"
                      : "text-text-muted hover:text-text hover:bg-surface/50"
                  }`}
                >
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 shrink-0 ${item.myDecision ? "bg-accent" : "bg-transparent border border-border"}`}
                    title={
                      item.myDecision
                        ? `You: ${decisionLabel(item.myDecision)}`
                        : "Not yet decided by you"
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{item.artistName}</span>
                    <span className="block text-xs text-text-muted truncate">
                      {item.submissionTitle}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>

        {/* Viewer */}
        <main className="flex-1 flex flex-col min-w-0 min-h-[60vh] lg:min-h-0">
          <div className="flex-1 relative bg-black min-h-[50vh]">
            {asset ? (
              <TransformWrapper key={asset.id} centerOnInit>
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.largeUrl}
                    alt={`${submission.artistName ?? "Artwork"}, page ${pageIndex + 1}`}
                    width={asset.width ?? undefined}
                    height={asset.height ?? undefined}
                    className="max-w-full max-h-full object-contain"
                  />
                </TransformComponent>
                <ZoomControls />
              </TransformWrapper>
            ) : (
              <p className="text-text-muted text-center pt-24 text-sm">
                No pages were rendered for this submission.
              </p>
            )}
            {submission.assets.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg/70 border border-border text-text disabled:opacity-0"
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.min(submission.assets.length - 1, i + 1))}
                  disabled={pageIndex === submission.assets.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-bg/70 border border-border text-text disabled:opacity-0"
                  aria-label="Next page"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {/* Page strip + caption */}
          <div className="border-t border-border shrink-0">
            <div className="flex items-center justify-between gap-3 px-3 pt-2 text-xs text-text-muted">
              <span className="truncate">
                Page {pageIndex + 1} of {submission.assets.length}
                {fileOf?.originalFilename ? ` · ${fileOf.originalFilename}` : ""}
                {asset && !asset.visibleInArtLibrary ? " · hidden from the gallery" : ""}
              </span>
              {fileOf && (
                <a
                  href={fileOf.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-text whitespace-nowrap underline"
                >
                  Open original PDF
                </a>
              )}
            </div>
            <div className="flex gap-2 p-3 overflow-x-auto">
              {submission.assets.map((a, i) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setPageIndex(i)}
                  aria-label={`Page ${i + 1}${a.visibleInArtLibrary ? "" : " (hidden)"}`}
                  aria-current={i === pageIndex ? "true" : undefined}
                  className={`shrink-0 w-14 h-14 border relative ${
                    i === pageIndex ? "border-accent" : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  {!a.visibleInArtLibrary && (
                    <span className="absolute inset-x-0 bottom-0 bg-bg/85 text-[10px] text-text-muted">
                      hidden
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Review panel */}
        <aside className="lg:w-[400px] border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto shrink-0">
          <SubmissionHeader submission={submission} />
          <DecisionForm
            submission={submission}
            reviewer={reviewer}
            decision={decision}
            setDecision={setDecision}
            commentRef={commentRef}
            nextId={position.nextId}
            onNext={() => go(position.nextId)}
          />
          <DecisionHistory submission={submission} reviewerId={reviewer.id} />
          {/* Keyed on the server's label set: after a sync or another
              reviewer's change, local optimistic state starts fresh. */}
          <LabelPicker
            key={submission.labelIds.join()}
            submission={submission}
            catalog={labelCatalog}
          />
          <Statement text={submission.coverLetter} />
          <PageTools submission={submission} asset={asset} pageNumber={pageIndex + 1} />
          {(submission.legacy.notes.length > 0 ||
            submission.legacy.recommendation !== "unreviewed") && (
            <LegacyNotes legacy={submission.legacy} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 border-b border-border">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-base text-text">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SubmissionHeader({ submission }: { submission: SubmissionDetail }) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-border">
      <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight">
        {submission.artistName ?? "Unknown artist"}
      </h1>
      <p className="text-sm text-text-muted mt-1">{submission.submissionTitle || "Untitled"}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Status</dt>
        <dd>{displayStatus(submission.officialStatus)}</dd>
        <dt className="text-text-muted">Assigned to</dt>
        <dd>
          {submission.reviewers.length
            ? submission.reviewers.map((r) => r.name).join(", ")
            : "No one"}
        </dd>
        <dt className="text-text-muted">Files</dt>
        <dd className="space-y-0.5">
          {submission.files.map((f) => (
            <a
              key={f.id}
              href={f.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate underline decoration-border hover:decoration-text"
              title={f.originalFilename ?? undefined}
            >
              {f.originalFilename ?? "File"}{" "}
              <span className="text-text-muted">
                ({f.pageCount} {f.pageCount === 1 ? "page" : "pages"})
              </span>
            </a>
          ))}
        </dd>
        {(submission.artistEmail || submission.artistWebsite) && (
          <>
            <dt className="text-text-muted">Contact</dt>
            <dd className="truncate">{submission.artistEmail ?? submission.artistWebsite}</dd>
          </>
        )}
      </dl>
      {submission.submittableUrl && (
        <a
          href={submission.submittableUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-accent hover:underline"
        >
          Open in Submittable
        </a>
      )}
    </div>
  );
}

function DecisionForm({
  submission,
  reviewer,
  decision,
  setDecision,
  commentRef,
  nextId,
  onNext,
}: {
  submission: SubmissionDetail;
  reviewer: { id: string; name: string };
  decision: Decision | null;
  setDecision: (d: Decision) => void;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
  nextId: string | null;
  onNext: () => void;
}) {
  const [comment, setComment] = useState("");
  const [name, setName] = useState(reviewer.name);
  const [editingName, setEditingName] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = submission.decisions.find((d) => d.reviewerId === reviewer.id);

  const preview = useMemo(
    () =>
      decision
        ? formatNoteText({ decision, reviewerName: name || "—", comment, date: new Date() })
        : null,
    [decision, name, comment],
  );

  const submit = () => {
    if (!decision || pending) return;
    start(async () => {
      const r = await postDecision(submission.id, { decision, reviewerName: name, comment });
      if (r.ok) {
        setComment("");
        setResult({ ok: true, text: r.message ?? "Posted to Submittable." });
      } else setResult({ ok: false, text: r.error });
    });
  };

  return (
    <Section
      title={mine ? "Change your decision" : "Your decision"}
      aside={
        mine && (
          <span className="text-xs text-text-muted">
            You: {decisionLabel(mine.decision)}, {formatDate(mine.createdAt)}
          </span>
        )
      }
    >
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Decision">
        {DECISIONS.map((d, i) => {
          const on = decision === d.value;
          return (
            <button
              type="button"
              key={d.value}
              role="radio"
              aria-checked={on}
              onClick={() => {
                setDecision(d.value);
                commentRef.current?.focus();
              }}
              className={`border px-2 py-2.5 text-sm transition-colors ${
                on
                  ? `${DECISION_TONE[d.value]} bg-surface border-current`
                  : "border-border text-text-muted hover:text-text hover:border-text-muted"
              }`}
            >
              {d.label}
              <span className="block text-[11px] text-text-muted mt-0.5">{i + 1}</span>
            </button>
          );
        })}
      </div>

      <label className="block mt-3">
        <span className="sr-only">Comment</span>
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={COMMENT_MAX}
          rows={3}
          placeholder="Comment (optional) — e.g. “need to see the full series”"
          className="w-full bg-surface border border-border text-sm text-text px-3 py-2 outline-none focus:border-accent resize-y"
        />
      </label>

      <div className="mt-1 text-xs text-text-muted flex items-center gap-2">
        {editingName ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            autoFocus
            maxLength={80}
            aria-label="Name on the note"
            className="bg-surface border border-border text-text px-2 py-0.5 outline-none focus:border-accent"
          />
        ) : (
          <>
            Signed as <span className="text-text">{name}</span>
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="underline hover:text-text"
            >
              edit
            </button>
          </>
        )}
      </div>

      {preview && (
        <div className="mt-3">
          <p className="text-xs text-text-muted mb-1">
            Note that will be posted to Submittable, visible to the assigned team:
          </p>
          <pre className="whitespace-pre-wrap font-[family-name:var(--font-ui)] text-sm bg-surface border border-border px-3 py-2 max-h-40 overflow-y-auto">
            {preview}
          </pre>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!decision || !name.trim() || pending}
        className="mt-3 w-full bg-accent text-bg px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {pending
          ? "Posting…"
          : decision
            ? `Post “${decisionLabel(decision)}” to Submittable`
            : "Choose a decision"}
      </button>
      <p className="mt-1.5 text-xs text-text-muted">
        Notes can&rsquo;t be edited or deleted once posted. ⌘↵ to post.
      </p>

      {result && (
        <div role="status" className={`mt-3 text-sm ${result.ok ? "text-text" : "text-red-300"}`}>
          {result.text}
          {result.ok && nextId && (
            <button type="button" onClick={onNext} className="ml-2 underline text-accent">
              Next submission (J)
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

function DecisionHistory({
  submission,
  reviewerId,
}: {
  submission: SubmissionDetail;
  reviewerId: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (submission.decisions.length === 0) return null;
  const latest = latestDecisionPerReviewer(submission.decisions);
  const shown = showAll ? submission.decisions : latest;

  return (
    <Section
      title="Decisions"
      aside={
        submission.decisions.length > latest.length && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-xs text-text-muted underline hover:text-text"
          >
            {showAll ? "Latest only" : `All ${submission.decisions.length}`}
          </button>
        )
      }
    >
      <ul className="space-y-3">
        {shown.map((d) => (
          <li key={d.id} className="text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <DecisionChip
                reviewerName={d.reviewerName}
                decision={d.decision}
                pushStatus={d.pushStatus}
              />
              <span className="text-xs text-text-muted">{formatDateTime(d.createdAt)}</span>
              {d.reviewerId === reviewerId && (
                <span className="text-xs text-text-muted">(you)</span>
              )}
            </div>
            {d.comment && <p className="mt-1 text-text-muted whitespace-pre-wrap">{d.comment}</p>}
            {d.pushStatus !== "pushed" && (
              <p className="mt-1 text-xs text-red-300">
                {d.pushStatus === "failed"
                  ? `Not posted to Submittable. ${d.pushError ?? ""}`
                  : "Posting…"}
                {d.pushStatus === "failed" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await retryDecision(d.id);
                        setError(r.ok ? null : r.error);
                      })
                    }
                    className="ml-2 underline text-text"
                  >
                    {pending ? "Retrying…" : "Retry"}
                  </button>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </Section>
  );
}

function LabelPicker({
  submission,
  catalog,
}: {
  submission: SubmissionDetail;
  catalog: { id: string; name: string }[];
}) {
  const [on, setOn] = useState(() => new Set(submission.labelIds));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (id: string) => {
    if (busy) return;
    const next = !on.has(id);
    setBusy(id);
    setError(null);
    setOn((s) => {
      const c = new Set(s);
      if (next) c.add(id);
      else c.delete(id);
      return c;
    });
    const r = await setSubmissionLabel(submission.id, id, next);
    if (!r.ok) {
      setError(r.error);
      setOn((s) => {
        const c = new Set(s);
        if (next) c.delete(id);
        else c.add(id);
        return c;
      });
    }
    setBusy(null);
  };

  return (
    <Section
      title="Labels"
      aside={<span className="text-xs text-text-muted">Saved to Submittable</span>}
    >
      <div className="flex flex-wrap gap-1.5">
        {catalog.map((l) => {
          const active = on.has(l.id);
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => toggle(l.id)}
              aria-pressed={active}
              disabled={busy !== null}
              className={`text-xs px-2.5 py-1.5 border transition-colors disabled:cursor-wait ${
                active
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-text-muted hover:border-accent hover:text-text"
              } ${busy === l.id ? "opacity-60" : ""}`}
            >
              {l.name}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </Section>
  );
}

function Statement({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 420;
  return (
    <Section
      title="Statement and cover letter"
      aside={
        long && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-text-muted underline hover:text-text"
          >
            {open ? "Show less" : "Show all"}
          </button>
        )
      }
    >
      <p
        className={`text-sm text-text/90 whitespace-pre-wrap leading-relaxed ${!open && long ? "line-clamp-6" : ""}`}
      >
        {text}
      </p>
    </Section>
  );
}

function PageTools({
  submission,
  asset,
  pageNumber,
}: {
  submission: SubmissionDetail;
  asset: ReviewAsset | undefined;
  pageNumber: number;
}) {
  const [pending, start] = useTransition();
  if (!asset) return null;
  const isCover = submission.thumbnailAssetId === asset.id;
  return (
    <details className="border-b border-border group">
      <summary className="px-5 py-4 cursor-pointer font-[family-name:var(--font-display)] text-base text-text-muted hover:text-text list-none flex justify-between">
        Page {pageNumber} settings
        <span className="text-xs font-[family-name:var(--font-ui)] group-open:hidden">
          Gallery visibility, page type
        </span>
      </summary>
      <div className="px-5 pb-4 space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Page type</span>
          <select
            value={asset.pageType}
            disabled={pending}
            onChange={(e) => start(() => setPageType(asset.id, e.target.value as PageType))}
            className="bg-surface border border-border text-text px-2 py-1 outline-none focus:border-accent"
          >
            {PAGE_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-text-muted">Show in the gallery</span>
          <input
            type="checkbox"
            checked={asset.visibleInArtLibrary}
            disabled={pending}
            onChange={(e) => start(() => setAssetVisibility(asset.id, e.target.checked))}
            className="accent-[var(--color-accent)] w-4 h-4"
          />
        </label>
        <button
          type="button"
          disabled={pending || isCover}
          onClick={() => start(() => setSubmissionThumbnail(submission.id, asset.id))}
          className="text-accent underline disabled:no-underline disabled:text-text-muted"
        >
          {isCover ? "This page is the cover image" : "Use this page as the cover image"}
        </button>
      </div>
    </details>
  );
}

function LegacyNotes({ legacy }: { legacy: SubmissionDetail["legacy"] }) {
  return (
    <Section title="Earlier notes">
      {legacy.recommendation !== "unreviewed" && (
        <p className="text-sm text-text-muted">
          Prototype recommendation: {legacy.recommendation.replace(/_/g, " ")}
        </p>
      )}
      {legacy.notes.map((n) => (
        <p key={n.id} className="text-sm text-text-muted border-t border-border pt-2 mt-2">
          {n.note} <span className="text-xs">({formatDate(n.createdAt)})</span>
        </p>
      ))}
    </Section>
  );
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["J / K", "Next / previous submission"],
    ["← / →", "Previous / next page"],
    ["1 · 2 · 3", "Accept · Tiered Reject · Reject"],
    ["⌘↵", "Post decision"],
    ["?", "Show or hide shortcuts"],
  ];
  return (
    <div className="border-b border-border bg-surface px-4 py-3 text-sm flex flex-wrap gap-x-8 gap-y-1 items-center">
      {rows.map(([k, v]) => (
        <span key={k}>
          <kbd className="text-text font-medium">{k}</kbd>{" "}
          <span className="text-text-muted">{v}</span>
        </span>
      ))}
      <button type="button" onClick={onClose} className="ml-auto text-xs text-text-muted underline">
        Close
      </button>
    </div>
  );
}
