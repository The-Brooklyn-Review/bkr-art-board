"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import type { SubmissionDetail, ReviewAsset } from "@/lib/submissions/getSubmission";
import {
  setAssetVisibility,
  setSubmissionThumbnail,
  setSubmissionTitle,
} from "@/lib/actions/mutations";
import {
  confirmDecisionPosted,
  postDecision,
  retryDecision,
  setSubmissionLabel,
  type ActionResult,
} from "@/lib/actions/review";
import {
  COMMENT_MAX,
  DECISIONS,
  decisionLabel,
  formatNoteText,
  effectivePushStatus,
  latestDecisionPerReviewer,
  type Decision,
} from "@/lib/reviewer/decisions";
import { displayStatus } from "@/lib/submittable/statuses";
import { readingPeriodOf } from "@/lib/submittable/readingPeriod";
import { formatDate, formatDateTime } from "@/lib/format";
import { DECISION_TONE } from "@/components/review/DecisionChip";
import { Menu, MenuButton, MenuDivider, MenuHeading } from "@/components/review/Menu";
import { ReviewerMenu } from "@/components/review/ReviewerMenu";
import { SyncStatus } from "@/components/review/SyncStatus";
import { TinyThumb } from "@/components/review/TinyThumb";
import { createShareLink, createSubmissionShareLink } from "@/lib/actions/sharePreview";
import { useCopyLink } from "@/lib/ui/useCopyLink";
import { LinkPending } from "@/components/review/LinkPending";
import { ArrowLeftIcon, ChevronIcon, ExternalIcon } from "@/components/review/icons";
import { QUEUE_HIDDEN_COOKIE } from "@/lib/ui/prefs";

/** A server action that threw (network drop) rather than returning an error. */
const UNREACHABLE: ActionResult = {
  ok: false,
  error: "Couldn't reach the app server — try again.",
};

interface QueueItem {
  id: string;
  artistName: string | null;
  submissionTitle: string | null;
  myDecision: string | null;
  myDecisionFailed: boolean;
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
  sync,
  queue,
  queueHidden: initialQueueHidden,
  position,
  query,
  reviewer,
  labelCatalog,
}: {
  submission: SubmissionDetail;
  sync: { lastSynced: string; stale: boolean };
  queue: QueueItem[];
  queueHidden: boolean;
  position: { index: number; total: number; prevId: string | null; nextId: string | null };
  query: string;
  reviewer: { id: string; name: string };
  labelCatalog: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);
  const asset: ReviewAsset | undefined = submission.assets[pageIndex];
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const draft = useDecisionDraft(submission.id, reviewer.name, decision, setDecision);
  const [showHelp, setShowHelp] = useState(false);
  const [queueHidden, setQueueHidden] = useState(initialQueueHidden);
  const queueRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Start downloading the next and previous pages' full-size images, so
  // paging through a PDF doesn't wait on a cold download each time.
  useEffect(() => {
    for (const i of [pageIndex + 1, pageIndex - 1]) {
      const url = submission.assets[i]?.largeUrl;
      if (url) preload(url, { as: "image" });
    }
  }, [pageIndex, submission.assets]);

  // Keep the current submission in view in the sidebar.
  useEffect(() => {
    revealWithin(
      queueRef.current,
      queueRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null,
      "center",
    );
  }, [queueHidden]);

  // Opening a submission re-reads it from Submittable, so a status or label
  // changed there shows up here without anyone syncing. Delayed a beat so
  // flicking through with J/K doesn't fire a request per keypress.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/submissions/${submission.id}/refresh`, { method: "POST" })
        .then((res) => res.json() as Promise<{ changed: boolean }>)
        .then((r) => {
          if (!cancelled && r.changed) router.refresh();
        })
        .catch(() => {});
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [submission.id, router]);

  // Desktop: focus the comment without letting the browser scroll anything
  // but the review panel (a plain focus() can shift the whole fixed layout).
  const focusComment = useCallback(() => {
    const el = commentRef.current;
    if (!el) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      el.focus({ preventScroll: true });
      revealWithin(panelRef.current, el);
    }
    // Phones: leave the page where it is — the bottom bar's Comment button
    // is how you get to the box there, and focusing would pop the keyboard.
  }, []);

  // Moving between submissions keeps this page on screen until the next
  // one is ready (no blank flash); the bar under the header shows it's on
  // its way.
  const [navigating, startNavigation] = useTransition();
  const go = useCallback(
    (id: string | null) => {
      if (id) startNavigation(() => router.push(`/submissions/${id}${query}`));
    },
    [router, query],
  );

  const toggleQueue = useCallback(() => {
    const next = !queueHidden;
    setQueueHidden(next);
    document.cookie = `${QUEUE_HIDDEN_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
  }, [queueHidden]);

  // Keyboard: J/K submissions, ←/→ pages, 1–3 decision, [ list. Ignored
  // while typing, except ⌘/Ctrl+Enter, which the form handles itself.
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
        focusComment();
      } else if (e.key === "[") toggleQueue();
      else if (e.key === "?") setShowHelp((s) => !s);
      else if (e.key === "Escape") setShowHelp(false);
      else return;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, position.nextId, position.prevId, submission.assets.length, toggleQueue, focusComment]);

  const fileOf = submission.files.find((f) => f.id === asset?.submissionFileId);
  const listHref = `/submissions${query}`;
  const mine = submission.decisions.find((d) => d.reviewerId === reviewer.id);
  const navBtn =
    "flex items-center gap-1 border border-border px-2 sm:px-2.5 py-1 text-text-muted hover:text-text hover:border-text-muted disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted transition-colors";

  return (
    // Desktop: pinned to the viewport and clipped (overflow-clip, not
    // overflow-hidden — a hidden box can still be scrolled by focus() or
    // scrollIntoView, which slid the whole layout up past its end). Only the
    // three columns scroll, each on its own.
    <div className="bg-bg text-text flex flex-col pb-24 lg:pb-0 lg:fixed lg:inset-0 lg:overflow-clip">
      {/* Top bar: where you are in the queue, and how to move through it */}
      <header className="relative border-b border-border px-4 lg:pr-6 py-2.5 flex items-center gap-3 sm:gap-4 shrink-0 text-sm">
        {navigating && (
          <span
            aria-hidden
            className="absolute left-0 right-0 -bottom-px h-0.5 bg-accent/80 animate-pulse"
          />
        )}
        <button
          type="button"
          onClick={toggleQueue}
          className="hidden xl:flex items-center justify-center w-8 h-8 border border-border text-text-muted hover:text-text hover:border-text-muted transition-colors"
          aria-pressed={!queueHidden}
          aria-label={queueHidden ? "Show the review list" : "Hide the review list"}
          title={`${queueHidden ? "Show" : "Hide"} the review list ( [ )`}
        >
          <SidebarIcon />
        </button>
        <Link
          href={listHref}
          className="flex items-center gap-1.5 text-text-muted hover:text-text whitespace-nowrap"
        >
          <ArrowLeftIcon />
          <span className="hidden sm:inline">Review list</span>
          <span className="sm:hidden">List</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(position.prevId)}
            disabled={!position.prevId}
            className={navBtn}
            title="Previous submission (K)"
            aria-label="Previous submission"
          >
            <ChevronIcon dir="left" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <span className="text-text-muted tabular-nums whitespace-nowrap text-xs sm:text-sm">
            {position.index >= 0 ? `${position.index + 1} of ${position.total}` : "Not in list"}
          </span>
          <button
            type="button"
            onClick={() => go(position.nextId)}
            disabled={!position.nextId}
            className={navBtn}
            title="Next submission (J)"
            aria-label="Next submission"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronIcon dir="right" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden md:inline">
            <SyncStatus lastSynced={sync.lastSynced} stale={sync.stale} />
          </span>
          <ReviewerMenu name={reviewer.name} onShortcuts={() => setShowHelp((s) => !s)} />
        </div>
      </header>
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:overflow-clip">
        {/* Queue */}
        {!queueHidden && (
          <aside
            ref={queueRef}
            className="w-60 border-r border-border overflow-y-auto overscroll-contain shrink-0 hidden xl:block"
            aria-label="Review list"
          >
            <ol>
              {queue.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/submissions/${item.id}${query}`}
                    aria-current={item.id === submission.id ? "page" : undefined}
                    className={`relative flex items-start gap-2 px-4 py-2 border-b border-border text-sm ${
                      item.id === submission.id
                        ? "bg-surface text-text shadow-[inset_2px_0_0_var(--color-accent)]"
                        : "text-text-muted hover:text-text hover:bg-bg-hover"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.artistName}</span>
                      <span className="block text-xs text-text-muted truncate">
                        {item.submissionTitle}
                      </span>
                    </span>
                    {item.myDecision && (
                      <span
                        className={`shrink-0 text-[11px] border px-1 mt-0.5 ${DECISION_TONE[item.myDecision] ?? ""}`}
                        title={`You: ${decisionLabel(item.myDecision)}`}
                      >
                        {item.myDecision === "tiered_reject"
                          ? "Tiered"
                          : decisionLabel(item.myDecision)}
                        {item.myDecisionFailed && <span className="text-red-300"> !</span>}
                      </span>
                    )}
                    <LinkPending />
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        )}

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
            {asset && !asset.visibleInArtLibrary && (
              <span className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-bg/85 border border-border px-2 py-1 text-xs text-text-muted">
                <EyeSlashIcon /> Hidden from the Gallery
              </span>
            )}
            {asset && (
              <div className="absolute top-3 right-3 z-20">
                <PageMenu submission={submission} asset={asset} pageNumber={pageIndex + 1} />
              </div>
            )}
            {submission.assets.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-bg/70 border border-border text-text hover:border-accent disabled:opacity-0"
                  aria-label="Previous page"
                >
                  <ChevronIcon dir="left" className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPageIndex((i) => Math.min(submission.assets.length - 1, i + 1))}
                  disabled={pageIndex === submission.assets.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-bg/70 border border-border text-text hover:border-accent disabled:opacity-0"
                  aria-label="Next page"
                >
                  <ChevronIcon dir="right" className="w-5 h-5" />
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
                  aria-label={`Page ${i + 1}${a.visibleInArtLibrary ? "" : " (hidden from the Gallery)"}${
                    submission.thumbnailAssetId === a.id ? " (cover)" : ""
                  }`}
                  aria-current={i === pageIndex ? "true" : undefined}
                  className={`shrink-0 w-14 h-14 border relative ${
                    i === pageIndex ? "border-accent" : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <TinyThumb
                    key={a.thumbnailUrl}
                    tinyUrl={a.tinyUrl}
                    thumbnailUrl={a.thumbnailUrl}
                    className={a.visibleInArtLibrary ? "" : "opacity-40"}
                  />
                  {!a.visibleInArtLibrary && (
                    <span className="absolute top-0.5 right-0.5 bg-bg/85 p-0.5 text-text-muted">
                      <EyeSlashIcon small />
                    </span>
                  )}
                  {submission.thumbnailAssetId === a.id && (
                    <span className="absolute inset-x-0 bottom-0 bg-bg/85 text-[10px] text-text-muted">
                      Cover
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Review panel */}
        <aside
          ref={panelRef}
          className="lg:w-[400px] border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto lg:overscroll-contain shrink-0"
        >
          <SubmissionHeader submission={submission} reviewerId={reviewer.id} />
          <Statement text={submission.coverLetter} />
          <DecisionForm
            formRef={formRef}
            mine={mine}
            decision={decision}
            setDecision={setDecision}
            draft={draft}
            commentRef={commentRef}
            focusComment={focusComment}
            nextId={position.nextId}
            onNext={() => go(position.nextId)}
          />
          <TeamDecisions submission={submission} reviewerId={reviewer.id} />
          {/* Keyed on the server's label set: after a sync or another
              reviewer's change, local optimistic state starts fresh. */}
          <LabelPicker
            key={submission.labelIds.join()}
            submission={submission}
            catalog={labelCatalog}
          />
          {(submission.legacy.notes.length > 0 ||
            submission.legacy.recommendation !== "unreviewed") && (
            <LegacyNotes legacy={submission.legacy} />
          )}
        </aside>
      </div>

      <MobileDecisionBar
        decision={decision}
        setDecision={setDecision}
        draft={draft}
        mine={mine}
        nextId={position.nextId}
        onNext={() => go(position.nextId)}
        onComment={() => {
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => commentRef.current?.focus({ preventScroll: true }), 350);
        }}
      />
    </div>
  );
}

/**
 * The decision being drafted: comment, signature, posting and its result.
 * Shared by the panel form and the phone's bottom bar so either can post.
 */
function useDecisionDraft(
  submissionId: string,
  reviewerName: string,
  decision: Decision | null,
  setDecision: (d: Decision | null) => void,
) {
  const [comment, setComment] = useState("");
  const name = reviewerName;
  const [pending, start] = useTransition();
  // Each result remembers the decision it was about, and only shows while
  // that's still the draft — a stale error never lingers after you move on.
  const [result, setResult] = useState<{
    ok: boolean;
    text: string;
    for: Decision;
    saved?: boolean;
  } | null>(null);
  const showResult =
    !!result && (result.ok || result.saved ? decision === null : decision === result.for);

  const submit = () => {
    if (!decision || pending || !name.trim()) return;
    const posting = decision;
    start(async () => {
      let r: Awaited<ReturnType<typeof postDecision>>;
      try {
        r = await postDecision(submissionId, { decision: posting, reviewerName: name, comment });
      } catch {
        // Unknown whether it was recorded or posted — don't invite a re-post.
        setDecision(null);
        setResult({
          ok: false,
          saved: true,
          for: posting,
          text: "Lost contact with the app while posting. Reload the page and check Decisions before posting again.",
        });
        return;
      }
      if (r.ok) {
        // Clear the choice too: a second ⌘↵ must not post a duplicate note
        // (notes can't be deleted from Submittable).
        setDecision(null);
        setComment("");
        setResult({ ok: true, text: r.message ?? "Posted to Submittable.", for: posting });
      } else if (r.saved) {
        // Recorded, just not delivered: clear the form so it can't be
        // posted twice; Retry under Decisions re-sends the same note.
        setDecision(null);
        setComment("");
        setResult({ ok: false, text: r.error, for: posting, saved: true });
      } else setResult({ ok: false, text: r.error, for: posting });
    });
  };

  return {
    comment,
    setComment,
    name,
    pending,
    result,
    showResult,
    submit,
    canPost: !!decision && !!name.trim() && !pending,
  };
}
type Draft = ReturnType<typeof useDecisionDraft>;

function Section({
  title,
  children,
  aside,
  sectionRef,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  sectionRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section
      ref={sectionRef}
      className="px-4 lg:px-6 py-5 border-b border-border last:border-b-0 scroll-mt-4"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-base text-text">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Who and what, then the facts as a label/value list. Artist and title get
 * the type hierarchy; everything administrative sits in one quiet grid so
 * the title never competes with status lines.
 */
function SubmissionHeader({
  submission,
  reviewerId,
}: {
  submission: SubmissionDetail;
  reviewerId: string;
}) {
  const me = submission.reviewers.some((r) => r.id === reviewerId);
  const others = submission.reviewers.filter((r) => r.id !== reviewerId).map((r) => r.name);
  const assigned = submission.reviewers.length
    ? [me ? "You" : null, ...others].filter(Boolean).join(", ")
    : "No one";
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text">{value}</dd>
    </>
  );
  return (
    <div className="px-4 lg:px-6 pt-5 pb-5 border-b border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-[1.75rem] leading-tight">
            {submission.artistName ?? "Unknown artist"}
          </h1>
          <EditableTitle submissionId={submission.id} title={submission.submissionTitle} />
        </div>
        <div className="shrink-0 mt-1 flex items-center gap-2">
          <ShareSubmissionButton submission={submission} />
          {submission.submittableUrl && (
            <a
              href={submission.submittableUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 border border-border px-2 py-1 text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
              title="Open this submission in Submittable"
            >
              Submittable <ExternalIcon className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        {submission.submittedAt &&
          row(
            "Submitted",
            <>
              {formatDate(new Date(submission.submittedAt))}
              {readingPeriodOf(submission.submittedAt) && (
                <span className="text-text-muted">
                  {" · "}
                  {readingPeriodOf(submission.submittedAt)!.label}
                </span>
              )}
            </>,
          )}
        {row("Status", displayStatus(submission.officialStatus))}
        {row("Assigned", assigned)}
        {row(
          submission.files.length === 1 ? "File" : "Files",
          <ul className="space-y-0.5">
            {submission.files.map((f) => (
              <li key={f.id} className="flex min-w-0 gap-1.5">
                <a
                  href={f.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate underline decoration-text-muted/40 underline-offset-2 hover:decoration-text"
                  title={`Open ${f.originalFilename ?? "file"}`}
                >
                  {f.originalFilename ?? "File"}
                </a>
                <span className="text-text-muted whitespace-nowrap">{f.pageCount} pp.</span>
              </li>
            ))}
          </ul>,
        )}
        {(submission.artistEmail || submission.artistWebsite) &&
          row(
            "Contact",
            <span className="block truncate text-text-muted">
              {[submission.artistEmail, submission.artistWebsite].filter(Boolean).join(" · ")}
            </span>,
          )}
      </dl>
    </div>
  );
}

function DecisionForm({
  formRef,
  mine,
  decision,
  setDecision,
  draft,
  commentRef,
  focusComment,
  nextId,
  onNext,
}: {
  formRef: React.RefObject<HTMLElement | null>;
  mine: SubmissionDetail["decisions"][number] | undefined;
  decision: Decision | null;
  setDecision: (d: Decision | null) => void;
  draft: Draft;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
  focusComment: () => void;
  nextId: string | null;
  onNext: () => void;
}) {
  const { comment, setComment, name, pending, result, showResult, submit } = draft;
  // Already decided: show that decision, with the form one click away.
  // Choosing 1–3 (or any decision) opens it too.
  const [changing, setChanging] = useState(false);
  const [seenMineId, setSeenMineId] = useState(mine?.id);
  if (mine?.id !== seenMineId) {
    // A new decision of yours just landed — fold the form back up.
    setSeenMineId(mine?.id);
    setChanging(false);
  }
  const formOpen = !mine || changing || decision !== null;
  // Picking a decision (click or 1–3) lands in the comment box, which only
  // exists once a decision is picked — hence an effect, not the click.
  useEffect(() => {
    if (decision) focusComment();
  }, [decision, focusComment]);

  const preview = useMemo(
    () =>
      decision
        ? formatNoteText({ decision, reviewerName: name || "—", comment, date: new Date() })
        : null,
    [decision, name, comment],
  );

  const resultBox = showResult && result && (
    <div role="status" className={`mt-3 text-sm ${result.ok ? "text-text" : "text-red-300"}`}>
      {result.text}
      {result.ok && nextId && (
        <button type="button" onClick={onNext} className="ml-2 underline text-accent">
          Next submission <span className="hidden lg:inline">(J)</span>
        </button>
      )}
    </div>
  );

  if (mine && !formOpen) {
    return (
      <Section
        sectionRef={formRef}
        title="Your decision"
        aside={
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="text-xs border border-border px-2 py-1 text-text-muted hover:text-text hover:border-text-muted transition-colors"
          >
            Change
          </button>
        }
      >
        <DecisionRow d={mine} />
        {resultBox}
      </Section>
    );
  }

  return (
    <Section
      sectionRef={formRef}
      title={mine ? "Change your decision" : "Your decision"}
      aside={
        mine && (
          <button
            type="button"
            onClick={() => {
              setChanging(false);
              setDecision(null);
            }}
            className="text-xs text-text-muted underline hover:text-text"
          >
            Cancel
          </button>
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
              onClick={() => setDecision(d.value)}
              className={`border px-2 py-2.5 text-sm transition-colors ${
                on
                  ? `${DECISION_TONE[d.value]} bg-surface border-current`
                  : "border-border text-text-muted hover:text-text hover:border-text-muted"
              }`}
            >
              {d.label}
              <span className="hidden lg:block text-[11px] text-text-muted mt-0.5">{i + 1}</span>
            </button>
          );
        })}
      </div>

      {/* Everything about the note appears only once there's a decision to
          post — before that, the three buttons are the whole question. */}
      {decision && (
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="block text-xs text-text-muted mb-1.5">Comment (optional)</span>
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
              placeholder="e.g. “need to see the full series”"
              className="w-full bg-surface border border-border text-sm text-text px-3 py-2 outline-none focus:border-accent resize-y"
            />
          </label>

          <div>
            {/* Signed with the reviewer chosen at sign-in — no per-note editing. */}
            <p className="mb-1.5 text-xs text-text-muted">
              Posts to Submittable as a note for the editors
            </p>
            <pre className="whitespace-pre-wrap font-[family-name:var(--font-ui)] text-sm text-text/90 bg-surface/60 border border-dashed border-border px-3 py-2.5 max-h-40 overflow-y-auto">
              {preview}
            </pre>
          </div>

          <div>
            <button
              type="button"
              onClick={submit}
              disabled={!draft.canPost}
              className="w-full bg-accent text-bg px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {pending ? "Posting…" : `Post “${decisionLabel(decision)}” to Submittable`}
            </button>
            <p className="mt-2 text-xs text-text-muted">
              Notes can&rsquo;t be edited or deleted once posted.
              <span className="hidden lg:inline"> ⌘↵ to post.</span>
            </p>
          </div>
        </div>
      )}

      {resultBox}
    </Section>
  );
}

/**
 * One reviewer's decision: who, what, when on one line; their comment set
 * off beneath; and, if the note didn't reach Submittable, what to do.
 */
function DecisionRow({
  d,
  who,
}: {
  d: SubmissionDetail["decisions"][number];
  /** Omitted under "Your decision", where it would only say "You". */
  who?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = effectivePushStatus(d);
  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2 min-w-0">
        {who && <span className="text-text truncate">{who}</span>}
        <span
          className={`font-medium whitespace-nowrap ${DECISION_TONE[d.decision]?.split(" ")[0] ?? ""}`}
        >
          {decisionLabel(d.decision)}
        </span>
        <span className="ml-auto text-xs text-text-muted whitespace-nowrap">
          {formatDateTime(d.createdAt)}
        </span>
      </div>
      {d.comment && (
        <p className="mt-1.5 border-l-2 border-border pl-3 text-text/80 whitespace-pre-wrap leading-relaxed">
          {d.comment}
        </p>
      )}
      <DeliveryStatus
        status={status}
        error={d.pushError}
        pending={pending}
        showPosted={!who}
        onRetry={() =>
          start(async () => {
            const r = await retryDecision(d.id).catch(() => UNREACHABLE);
            setError(r.ok ? null : r.error);
          })
        }
        onConfirm={() =>
          start(async () => {
            const r = await confirmDecisionPosted(d.id).catch(() => UNREACHABLE);
            setError(r.ok ? null : r.error);
          })
        }
      />
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** What the other assigned reviewers decided — or that they haven't yet. */
function TeamDecisions({
  submission,
  reviewerId,
}: {
  submission: SubmissionDetail;
  reviewerId: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const latest = latestDecisionPerReviewer(submission.decisions).filter(
    (d) => d.reviewerId !== reviewerId,
  );
  const decidedIds = new Set(latest.map((d) => d.reviewerId));
  const waiting = submission.reviewers.filter((r) => r.id !== reviewerId && !decidedIds.has(r.id));
  const earlier =
    submission.decisions.length - latestDecisionPerReviewer(submission.decisions).length;
  if (latest.length === 0 && waiting.length === 0 && earlier === 0) return null;

  return (
    <Section
      title="Other reviewers"
      aside={
        earlier > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-xs text-text-muted underline hover:text-text"
          >
            {showAll ? "Latest only" : `Full history (${submission.decisions.length})`}
          </button>
        )
      }
    >
      <ul className="space-y-4">
        {(showAll ? submission.decisions : latest).map((d) => (
          <li key={d.id}>
            <DecisionRow d={d} who={d.reviewerId === reviewerId ? "You" : d.reviewerName} />
          </li>
        ))}
        {!showAll &&
          waiting.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2 text-sm">
              <span className="text-text">{r.name}</span>
              <span className="text-text-muted">hasn&rsquo;t decided yet</span>
            </li>
          ))}
      </ul>
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
    try {
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
    } catch {
      setError("Couldn't reach the app server. Reload and check the label.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Labels"
      aside={<span className="text-xs text-text-muted">Changes sync to Submittable</span>}
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
              title={
                active
                  ? `Remove “${l.name}” — removes it in Submittable too`
                  : `Add “${l.name}” — adds it in Submittable too`
              }
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

function Statement({ text: raw }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  // Submitters paste with stray runs of blank lines; one paragraph break is enough.
  const text = raw
    ?.replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*(\n[ \t]*)+/g, "\n\n")
    // A lone line break before a lowercase word is a wrap from a PDF or
    // form field, not a break the artist meant.
    .replace(/([^\n])\n(?=[a-z])/g, "$1 ")
    .trim();
  if (!text) return null;
  const long = text.length > 280;
  return (
    <Section
      title="Statement"
      aside={
        long && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-text-muted underline hover:text-text"
          >
            {open ? "Show less" : "Read all"}
          </button>
        )
      }
    >
      <p
        className={`text-sm text-text/90 whitespace-pre-wrap leading-relaxed ${!open && long ? "line-clamp-4" : ""}`}
      >
        {text}
      </p>
    </Section>
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
    ["[", "Hide or show the review list"],
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

/** Whether a decision's note reached Submittable, and what to do if not. */
function DeliveryStatus({
  status,
  error,
  pending,
  onRetry,
  onConfirm,
  showPosted,
}: {
  status: "pending" | "pushed" | "failed" | "unknown";
  error: string | null;
  pending: boolean;
  onRetry: () => void;
  onConfirm: () => void;
  /** Confirm delivery under your own decision; others' rows stay quiet. */
  showPosted: boolean;
}) {
  if (status === "pushed")
    return showPosted ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-text-muted">
        <CheckIcon /> Posted to Submittable
      </p>
    ) : null;
  // Only visible for the moment between saving here and Submittable answering.
  if (status === "pending")
    return <p className="mt-1.5 text-xs text-text-muted">Posting to Submittable…</p>;
  const why = error ? ` (${error.replace(/\.$/, "")})` : "";
  const btn =
    "border border-red-300/40 px-2 py-1 text-text hover:border-red-300 disabled:opacity-50";
  return (
    <div className="mt-2 border border-red-300/30 bg-red-300/5 px-3 py-2 text-xs text-red-200">
      {status === "failed" ? (
        <>
          <p>Submittable refused this note{why}. Nothing was posted.</p>
          <button type="button" disabled={pending} onClick={onRetry} className={`mt-2 ${btn}`}>
            {pending ? "Posting…" : "Retry"}
          </button>
        </>
      ) : (
        <>
          <p>
            Couldn&rsquo;t confirm this note reached Submittable{why}. Check the submission&rsquo;s
            notes there.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={onConfirm} className={btn}>
              It&rsquo;s there
            </button>
            <button type="button" disabled={pending} onClick={onRetry} className={btn}>
              {pending ? "Posting…" : "It isn’t — post again"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/**
 * Phones: decide without scrolling past the artwork. Pick a decision, then
 * post straight from the bar or jump to the form to add a comment.
 */
function MobileDecisionBar({
  decision,
  setDecision,
  draft,
  mine,
  nextId,
  onNext,
  onComment,
}: {
  decision: Decision | null;
  setDecision: (d: Decision | null) => void;
  draft: Draft;
  mine: SubmissionDetail["decisions"][number] | undefined;
  nextId: string | null;
  onNext: () => void;
  onComment: () => void;
}) {
  const short = (d: string) => (d === "tiered_reject" ? "Tiered" : decisionLabel(d));
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur-sm border-t border-border px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {draft.showResult && draft.result ? (
        <p
          role="status"
          className={`text-xs mb-2 ${draft.result.ok ? "text-text" : "text-red-300"} line-clamp-2`}
        >
          {draft.result.text}
        </p>
      ) : mine && !decision ? (
        <p className="text-xs mb-2 text-text-muted">
          You decided {decisionLabel(mine.decision)} · {formatDate(mine.createdAt)}
        </p>
      ) : null}
      {decision ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setDecision(null)}
            className={`flex items-center gap-1.5 border border-current bg-surface px-3 py-2.5 text-sm ${DECISION_TONE[decision]}`}
            aria-label={`${decisionLabel(decision)} selected — tap to change`}
          >
            {short(decision)} <span aria-hidden>×</span>
          </button>
          <button
            type="button"
            onClick={onComment}
            className="border border-border px-3 py-2.5 text-sm text-text-muted"
          >
            {draft.comment.trim() ? "Edit comment" : "Comment"}
          </button>
          <button
            type="button"
            onClick={draft.submit}
            disabled={!draft.canPost}
            className="flex-1 bg-accent text-bg px-3 py-2.5 text-sm font-medium disabled:opacity-40"
          >
            {draft.pending ? "Posting…" : "Post"}
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          {DECISIONS.map((d) => (
            <button
              type="button"
              key={d.value}
              onClick={() => setDecision(d.value)}
              className="flex-1 border border-border px-2 py-2.5 text-sm text-text"
            >
              {short(d.value)}
            </button>
          ))}
          <button
            type="button"
            onClick={onNext}
            disabled={!nextId}
            className="flex items-center gap-1 border border-border px-3 py-2.5 text-sm text-text-muted disabled:opacity-30"
            aria-label="Next submission"
          >
            Next <ChevronIcon dir="right" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The artwork's own ⋯ menu: what this page does in the Gallery. */
function PageMenu({
  submission,
  asset,
  pageNumber,
}: {
  submission: SubmissionDetail;
  asset: ReviewAsset;
  pageNumber: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const share = useCopyLink();
  const shareKey = `artwork:${asset.id}`;
  const shareStatus = share.label(shareKey, "");
  const isCover = submission.thumbnailAssetId === asset.id;
  // Caught rather than thrown: an error inside a transition would replace
  // the whole page (and any half-written comment) with the error page.
  const run = (action: () => Promise<unknown>, failed: string) =>
    start(async () => {
      setError(null);
      try {
        await action();
      } catch {
        setError(failed);
      }
    });
  return (
    <>
      <Menu
        align="right"
        chevron={false}
        panelClassName="w-72"
        ariaLabel={`Page ${pageNumber} options`}
        buttonClassName={`w-8 h-8 flex items-center justify-center bg-bg/80 border border-border text-text hover:border-accent transition-colors ${
          pending ? "opacity-50" : ""
        }`}
        label={
          <span aria-hidden className="text-base leading-none -mt-1.5">
            ⋯
          </span>
        }
      >
        <MenuHeading>Page {pageNumber} in the Gallery</MenuHeading>
        <MenuButton
          disabled={pending}
          onSelect={() =>
            run(
              () => setAssetVisibility(asset.id, !asset.visibleInArtLibrary),
              "Couldn't change this page's visibility — try again.",
            )
          }
        >
          {asset.visibleInArtLibrary
            ? "Hide this page from the Gallery"
            : "Show this page in the Gallery"}
        </MenuButton>
        <MenuButton
          disabled={pending || isCover}
          onSelect={() =>
            run(
              () => setSubmissionThumbnail(submission.id, asset.id),
              "Couldn't change the cover image — try again.",
            )
          }
        >
          {isCover ? "This page is the cover image" : "Use as the cover image"}
        </MenuButton>
        <MenuDivider />
        <MenuButton
          disabled={!asset.shareable}
          onSelect={() =>
            share.copy(shareKey, async () => `/share/${await createShareLink(asset.id)}`)
          }
        >
          {asset.shareable ? "Copy share link to this page" : "Hidden pages can\u2019t be shared"}
        </MenuButton>
      </Menu>
      {shareStatus && (
        <p
          role="status"
          className="absolute right-0 top-10 w-40 bg-bg/90 border border-border px-2 py-1 text-xs text-text"
        >
          {shareStatus}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-10 w-64 bg-bg/90 border border-red-500/60 px-2 py-1 text-xs text-red-300"
        >
          {error}
        </p>
      )}
    </>
  );
}

/**
 * The submission's title, correctable in place: Submittable's title is
 * often generic ("Visual Art Submission") when the pieces have names.
 * Click to edit; Enter or clicking away saves, Escape cancels. Saved
 * locally only (see setSubmissionTitle).
 */
function EditableTitle({ submissionId, title }: { submissionId: string; title: string | null }) {
  const [shown, setShown] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const font = "font-[family-name:var(--font-display)] italic text-lg leading-snug";

  // Grow with the text (titles listing several pieces run long).
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (!editing) return;
    fit();
    ref.current?.focus();
    ref.current?.select();
  }, [editing]);

  const save = () => {
    setEditing(false);
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || next === shown) return;
    const before = shown;
    setShown(next);
    setError(null);
    start(async () => {
      const r = await setSubmissionTitle(submissionId, next).catch(() => UNREACHABLE);
      if (r.ok) {
        if ("title" in r) setShown(r.title);
      } else {
        setShown(before);
        setError(r.error);
      }
    });
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        maxLength={300}
        aria-label="Submission title"
        onChange={(e) => {
          setDraft(e.target.value);
          fit();
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className={`mt-1 block w-full resize-none overflow-hidden bg-surface border border-accent px-1.5 -mx-1.5 py-0.5 outline-none text-text ${font}`}
      />
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(shown ?? "");
          setEditing(true);
        }}
        title="Edit title"
        className={`group mt-1 block text-left text-text/85 hover:text-text ${font} ${
          pending ? "opacity-60" : ""
        }`}
      >
        {/* Titles of works in italics — the editorial convention, and what
            separates the work from the person at a glance. */}
        {shown || "Untitled"}
        <span
          aria-hidden
          className="not-italic ml-2 text-sm text-text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
        >
          ✎
        </span>
        <span className="sr-only"> (edit title)</span>
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </>
  );
}

/** Copies a public link to the submission's visible pieces (/share/s/…). */
function ShareSubmissionButton({ submission }: { submission: SubmissionDetail }) {
  const share = useCopyLink();
  const key = `submission:${submission.id}`;
  if (!submission.assets.some((a) => a.shareable)) return null;
  return (
    <button
      type="button"
      onClick={() =>
        share.copy(key, async () => `/share/s/${await createSubmissionShareLink(submission.id)}`)
      }
      disabled={share.copying(key)}
      title="Copy a public link to this submission's pieces (artist and titles only)"
      className="border border-accent/60 px-2 py-1 text-xs text-text hover:bg-bg-hover transition-colors disabled:opacity-60"
    >
      {share.label(key, "Share")}
    </button>
  );
}

function EyeSlashIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={small ? "w-3 h-3" : "w-3.5 h-3.5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" />
      <circle cx="8" cy="8" r="1.8" />
      <path d="M2.5 13.5l11-11" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <rect x="2" y="3" width="12" height="10" />
      <path d="M6 3v10" />
    </svg>
  );
}

/**
 * Scrolls `el` into view inside `container` only. Element.scrollIntoView
 * also scrolls every ancestor — including clipped ones and the page — which
 * is how the layout used to slide up out of the viewport.
 */
function revealWithin(
  container: HTMLElement | null,
  el: HTMLElement | null,
  align: "center" | "nearest" = "nearest",
) {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (align === "center") container.scrollTop += r.top - c.top - (c.height - r.height) / 2;
  else if (r.top < c.top) container.scrollTop += r.top - c.top - 16;
  else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom + 16;
}
