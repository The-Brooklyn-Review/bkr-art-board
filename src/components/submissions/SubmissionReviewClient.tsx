"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import type { SubmissionDetail, SubmissionQueueItem, ReviewAsset } from "@/lib/submissions/getSubmission";
import {
  setLocalRecommendation,
  setPageType,
  setAssetVisibility,
  setSubmissionThumbnail,
  addReviewNote,
  setNeedsSubmittableUpdate,
  markSubmittableUpdateDone,
  type LocalReviewRecommendation,
  type PageType,
} from "@/lib/actions/mutations";

const RECOMMENDATIONS: { value: LocalReviewRecommendation; label: string }[] = [
  { value: "accept", label: "Accept" },
  { value: "consider_or_delayed_accept", label: "Consider or Delayed Accept" },
  { value: "tiered_reject", label: "Tiered Reject" },
  { value: "reject", label: "Reject" },
];

const PAGE_TYPES: { value: PageType; label: string }[] = [
  { value: "artwork", label: "Artwork" },
  { value: "cover_statement", label: "Cover / Statement" },
  { value: "cv_bio", label: "CV / Bio" },
  { value: "contact_sheet", label: "Contact Sheet" },
  { value: "unknown", label: "Unknown" },
];

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-3 right-3 flex gap-1 z-10">
      <button
        onClick={() => zoomOut()}
        className="w-8 h-8 bg-surface border border-border text-text hover:border-accent"
      >
        −
      </button>
      <button
        onClick={() => resetTransform()}
        className="w-8 h-8 bg-surface border border-border text-text hover:border-accent text-xs"
      >
        1:1
      </button>
      <button
        onClick={() => zoomIn()}
        className="w-8 h-8 bg-surface border border-border text-text hover:border-accent"
      >
        +
      </button>
    </div>
  );
}

export function SubmissionReviewClient({
  submission,
  queue,
}: {
  submission: SubmissionDetail;
  queue: SubmissionQueueItem[];
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [isPending, startTransition] = useTransition();

  const asset: ReviewAsset | undefined = submission.assets[pageIndex];

  const runAction = (fn: () => Promise<void>) => startTransition(fn);

  return (
    <div className="h-screen bg-bg text-text flex flex-col overflow-hidden">
      <div className="bg-accent text-bg text-center text-xs py-1.5 font-medium tracking-wide uppercase shrink-0">
        Submission Review UI — Prototype
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: queue */}
        <aside className="w-64 border-r border-border overflow-y-auto shrink-0 hidden lg:block">
          <div className="p-4 border-b border-border">
            <input
              type="text"
              placeholder="Search queue… (stub)"
              disabled
              className="w-full bg-surface border border-border text-sm text-text-muted px-3 py-1.5 outline-none opacity-50"
            />
          </div>
          <ul>
            {queue.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/submissions/${item.id}`}
                  className={`block px-4 py-2.5 border-b border-border text-sm ${
                    item.id === submission.id
                      ? "bg-surface text-text"
                      : "text-text-muted hover:text-text hover:bg-surface/50"
                  }`}
                >
                  <div className="truncate">{item.artistName}</div>
                  <div className="text-xs text-text-muted truncate">{item.submissionTitle}</div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Center: viewer */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative bg-black min-h-0">
            {asset ? (
              <TransformWrapper key={asset.id} centerOnInit>
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.largeUrl}
                    alt=""
                    width={asset.width ?? undefined}
                    height={asset.height ?? undefined}
                    className="max-w-full max-h-full object-contain"
                  />
                </TransformComponent>
                <ZoomControls />
              </TransformWrapper>
            ) : (
              <p className="text-text-muted text-center pt-24">No pages found.</p>
            )}

            {submission.assets.length > 1 && (
              <>
                <button
                  onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  disabled={pageIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-surface/80 border border-border text-text disabled:opacity-30"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPageIndex((i) => Math.min(submission.assets.length - 1, i + 1))}
                  disabled={pageIndex === submission.assets.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-surface/80 border border-border text-text disabled:opacity-30"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {/* Page thumbnail strip */}
          <div className="flex gap-2 p-3 border-t border-border overflow-x-auto shrink-0">
            {submission.assets.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setPageIndex(i)}
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
                  <span className="absolute top-0 right-0 bg-bg/90 text-[10px] px-1 text-text">
                    hidden
                  </span>
                )}
              </button>
            ))}
          </div>
        </main>

        {/* Right: metadata + controls */}
        <aside className="w-80 border-l border-border overflow-y-auto shrink-0 p-5 hidden md:block">
          <h1 className="font-[family-name:var(--font-display)] text-xl text-text">
            {submission.artistName}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">{submission.submissionTitle}</p>

          <dl className="text-xs text-text-muted mt-3 space-y-1">
            {submission.artistEmail && (
              <div>
                <dt className="inline text-text-muted">Email: </dt>
                <dd className="inline text-text">{submission.artistEmail}</dd>
              </div>
            )}
            {submission.artistPhone && (
              <div>
                <dt className="inline">Phone: </dt>
                <dd className="inline text-text">{submission.artistPhone}</dd>
              </div>
            )}
            {submission.artistWebsite && (
              <div>
                <dt className="inline">Website: </dt>
                <dd className="inline text-text">{submission.artistWebsite}</dd>
              </div>
            )}
          </dl>

          {submission.labels.length > 0 && (
            <p className="text-xs text-accent uppercase tracking-wide mt-3">
              {submission.labels.map((l) => l.name).join(" · ")}
            </p>
          )}

          {submission.coverLetter && (
            <details className="mt-3">
              <summary className="text-xs text-text-muted underline cursor-pointer hover:text-text">
                Cover letter / statement
              </summary>
              <p className="text-xs text-text-muted mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {submission.coverLetter}
              </p>
            </details>
          )}

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Local recommendation</p>
            <div className="flex flex-col gap-1.5">
              {RECOMMENDATIONS.map((r) => (
                <button
                  key={r.value}
                  disabled={isPending}
                  onClick={() => runAction(() => setLocalRecommendation(submission.id, r.value))}
                  className={`text-left text-sm px-3 py-1.5 border transition-colors disabled:opacity-50 ${
                    submission.localReviewRecommendation === r.value
                      ? "bg-accent text-bg border-accent"
                      : "border-border text-text-muted hover:border-accent hover:text-text"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {asset && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
                This page {asset.pageNumber ? `(page ${asset.pageNumber})` : ""}
              </p>

              <label className="block text-xs text-text-muted mb-1">Page type</label>
              <select
                value={asset.pageType}
                disabled={isPending}
                onChange={(e) => runAction(() => setPageType(asset.id, e.target.value as PageType))}
                className="w-full bg-surface border border-border text-sm text-text px-2 py-1.5 mb-2 outline-none focus:border-accent"
              >
                {PAGE_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-sm text-text mb-2">
                <input
                  type="checkbox"
                  checked={asset.visibleInArtLibrary}
                  disabled={isPending}
                  onChange={(e) => runAction(() => setAssetVisibility(asset.id, e.target.checked))}
                />
                Visible in Art Library
              </label>

              <button
                disabled={isPending}
                onClick={() => runAction(() => setSubmissionThumbnail(submission.id, asset.id))}
                className="text-xs text-accent underline hover:opacity-80 disabled:opacity-50"
              >
                Set as submission thumbnail
              </button>
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Notes</p>
            {submission.notes.map((n) => (
              <p key={n.id} className="text-xs text-text-muted border-b border-border py-1.5">
                {n.note}
              </p>
            ))}
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="w-full bg-surface border border-border text-sm text-text px-2 py-1.5 mt-2 outline-none focus:border-accent resize-none"
            />
            <button
              disabled={isPending || !noteText.trim()}
              onClick={() =>
                runAction(async () => {
                  await addReviewNote(submission.id, noteText);
                  setNoteText("");
                })
              }
              className="text-xs text-accent underline hover:opacity-80 disabled:opacity-30 mt-1"
            >
              Add note
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-border flex flex-col gap-2">
            {submission.submittableUrl && (
              <a
                href={submission.submittableUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent underline hover:opacity-80"
              >
                Open in Submittable
              </a>
            )}
            <button
              disabled={isPending}
              onClick={() => runAction(() => setNeedsSubmittableUpdate(submission.id, !submission.needsSubmittableUpdate))}
              className="text-xs text-left text-text-muted underline hover:text-text disabled:opacity-50"
            >
              {submission.needsSubmittableUpdate ? "✓ Marked: Needs Submittable Update" : "Mark Needs Submittable Update"}
            </button>
            <button
              disabled={isPending || submission.submittableUpdateDone}
              onClick={() => runAction(() => markSubmittableUpdateDone(submission.id))}
              className="text-xs text-left text-text-muted underline hover:text-text disabled:opacity-50"
            >
              {submission.submittableUpdateDone ? "✓ Done in Submittable" : "Mark Done in Submittable"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
