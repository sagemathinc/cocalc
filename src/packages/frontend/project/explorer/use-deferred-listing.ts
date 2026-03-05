/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Deferred listing updates for the file explorer and flyout.
 *
 * Buffers incoming listing data so the UI doesn't change under
 * the user's eyes while they're reading/selecting.  A "Refresh"
 * button lets them apply pending updates on demand.
 *
 * Auto-flush triggers:
 * - `currentPath` changes  (directory navigation)
 * - `allowNextUpdate()` is called  (file action / terminal command)
 *   Opens a pass-through latch for 5 seconds: the next listing
 *   update that arrives is applied immediately.  After one update
 *   or 5s timeout, the latch closes automatically.
 * - `alwaysPassThrough` is true  (user preference "auto-update listing")
 *
 * Change detection uses a caller-supplied fingerprint function so
 * that new Redux references with identical content don't trigger
 * a false "pending update" state.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { usePrevious } from "@cocalc/frontend/app-framework/hooks";
import { hash_string } from "@cocalc/util/misc";

/** How long the pass-through latch stays open (ms). */
const LATCH_TIMEOUT_MS = 5_000;

/** Debounce for batching rapid Redux updates into one render (ms). */
const BATCH_FLUSH_MS = 10;

interface UseDeferredListingOpts<T, E> {
  /** The live (latest) listing from Redux / computed selector. */
  liveListing: T | undefined;
  /** Optional extra data to defer in sync (e.g. file_map). */
  liveExtra?: E;
  /** Current directory path — changes trigger auto-flush. */
  currentPath: string;
  /** When true, never buffer — all updates flow through immediately. */
  alwaysPassThrough: boolean;
  /**
   * Compute a content fingerprint for `liveListing`.
   * Two listings with the same fingerprint are considered identical
   * even if their JS references differ (common with Redux selectors).
   * When omitted, falls back to reference equality.
   */
  fingerprint?: (listing: any) => string;
}

interface UseDeferredListingResult<T, E> {
  /** The listing to render (may lag behind liveListing). */
  displayListing: T | undefined;
  /** The extra data to render (synced with displayListing). */
  displayExtra: E | undefined;
  /** True when liveListing content differs from displayListing. */
  hasPending: boolean;
  /** Manually apply the pending update. */
  flush: () => void;
  /**
   * Open the pass-through latch: the next listing update that arrives
   * within 5 seconds will be applied immediately.  Also flushes any
   * already-pending update right now.  Safe to call multiple times.
   */
  allowNextUpdate: () => void;
}

export function useDeferredListing<T, E = undefined>({
  liveListing,
  liveExtra,
  currentPath,
  alwaysPassThrough,
  fingerprint: fingerprintFn,
}: UseDeferredListingOpts<T, E>): UseDeferredListingResult<T, E> {
  // Compute fingerprints for change detection.
  const liveFP = fingerprintFn?.(liveListing) ?? null;

  // The "committed" snapshot — what the UI currently renders.
  const [committed, setCommitted] = useState<{
    listing: T | undefined;
    extra: E | undefined;
    fp: string | null;
  }>({ listing: liveListing, extra: liveExtra, fp: liveFP });

  // Always track the very latest incoming data.
  const latestRef = useRef({
    listing: liveListing,
    extra: liveExtra,
    fp: liveFP,
  });
  latestRef.current = { listing: liveListing, extra: liveExtra, fp: liveFP };

  // The fingerprint at mount time.  Any update that arrives while
  // committed still matches this value is considered "initial data"
  // and auto-flushed (so the UI doesn't start blank / with a spinner).
  const mountFPRef = useRef(liveFP);

  // Grace window: stays open for LATCH_TIMEOUT_MS after mount and
  // after each directory change.  Unlike the latch (which closes after
  // one update), the grace window auto-flushes ALL updates that arrive
  // within the window.  This lets enrichment data (is_public, isopen)
  // arrive asynchronously without triggering a "Refresh" banner.
  const graceRef = useRef(true);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openGraceWindow = useCallback(() => {
    graceRef.current = true;
    if (graceTimerRef.current != null) clearTimeout(graceTimerRef.current);
    graceTimerRef.current = setTimeout(() => {
      graceRef.current = false;
      graceTimerRef.current = null;
    }, LATCH_TIMEOUT_MS);
  }, []);

  // Pass-through latch: when true, the next liveListing change will
  // be applied immediately and the latch will close.
  const latchRef = useRef(false);
  const latchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    setCommitted({
      listing: latestRef.current.listing,
      extra: latestRef.current.extra,
      fp: latestRef.current.fp,
    });
  }, []);

  // Debounced flush: collapses rapid Redux updates (listing + public
  // paths + starred files) into a single render.  Reads from latestRef
  // so it always commits the most recent data.
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchedFlush = useCallback(() => {
    if (batchTimerRef.current != null) clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;
      flush();
    }, BATCH_FLUSH_MS);
  }, [flush]);

  const closeLatch = useCallback(() => {
    latchRef.current = false;
    if (latchTimerRef.current != null) {
      clearTimeout(latchTimerRef.current);
      latchTimerRef.current = null;
    }
  }, []);

  const allowNextUpdate = useCallback(() => {
    // Open the latch and flush whatever is pending right now.
    latchRef.current = true;
    flush();
    // Auto-close after timeout to prevent indefinite pass-through.
    if (latchTimerRef.current != null) {
      clearTimeout(latchTimerRef.current);
    }
    latchTimerRef.current = setTimeout(closeLatch, LATCH_TIMEOUT_MS);
  }, [flush, closeLatch]);

  // Open the grace window on mount.
  useEffect(() => {
    openGraceWindow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (latchTimerRef.current != null) {
        clearTimeout(latchTimerRef.current);
      }
      if (graceTimerRef.current != null) {
        clearTimeout(graceTimerRef.current);
      }
      if (batchTimerRef.current != null) {
        clearTimeout(batchTimerRef.current);
      }
    };
  }, []);

  // Auto-flush when directory changes.  Also reset mountFPRef so that
  // the next content change (the new directory's listing arriving from
  // Redux) will auto-flush instead of being buffered.  Re-open the
  // grace window so enrichment data arriving after the new listing
  // (is_public, isopen) is also auto-flushed.
  const prevPath = usePrevious(currentPath);
  useEffect(() => {
    if (prevPath != null && prevPath !== currentPath) {
      flush();
      mountFPRef.current = latestRef.current.fp;
      openGraceWindow();
    }
  }, [currentPath, prevPath, flush, openGraceWindow]);

  // Detect content changes via fingerprint (or reference as fallback).
  const contentChanged = fingerprintFn
    ? liveFP !== committed.fp
    : liveListing !== committed.listing;

  // When alwaysPassThrough is true, flush on every real content change.
  // Also when the latch is open, flush on the next content change
  // and close the latch.
  // Also auto-flush the very first real data (undefined → something),
  // so the listing doesn't stay stuck on the Loading spinner.
  //
  // Uses batchedFlush (10ms debounce) so that rapid cascading Redux
  // updates (listing + public paths + starred files) collapse into a
  // single render instead of causing a row-by-row "waterfall" effect.
  useEffect(() => {
    if (!contentChanged) return;
    if (alwaysPassThrough) {
      batchedFlush();
    } else if (latchRef.current) {
      // Close the latch inside the batched callback, not synchronously —
      // otherwise a second update arriving within the 10ms batch window
      // would see the latch already closed and be silently dropped.
      if (batchTimerRef.current != null) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null;
        closeLatch();
        flush();
      }, BATCH_FLUSH_MS);
    } else if (committed.fp === mountFPRef.current) {
      // Committed listing still matches the mount-time state
      // (empty array, undefined, or stale from before navigation).
      // Auto-flush so the UI doesn't start blank.
      batchedFlush();
    } else if (graceRef.current) {
      // Within the grace window after mount/navigation — auto-flush
      // follow-up updates like shared file info arriving after the
      // base listing, without showing a "Refresh" banner.
      batchedFlush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFP, liveListing, alwaysPassThrough, batchedFlush, closeLatch]);

  return {
    displayListing: committed.listing,
    displayExtra: committed.extra,
    hasPending: contentChanged,
    flush,
    allowNextUpdate,
  };
}

/**
 * Fingerprint a file listing for deferred-update change detection.
 *
 * Includes name, mtime, size, and UI-relevant flags (is_public, isopen).
 * This is intentionally limited to fields that represent real state changes
 * the user should see — cosmetic/computed fields (isactive, mask, display_name)
 * are excluded to avoid false-positive "pending update" notifications.
 *
 * Uses an incremental hash so the fingerprint is a compact number
 * even for directories with thousands of files.
 */
export function fileListingFingerprint(
  listing:
    | Array<{
        name: string;
        mtime?: number;
        size?: number;
        is_public?: boolean;
        isopen?: boolean;
      }>
    | undefined,
): string {
  if (!listing) return "";
  let raw = String(listing.length);
  for (const e of listing) {
    raw += `\n${e.name}:${e.mtime ?? 0}:${e.size ?? 0}:${e.is_public ? 1 : 0}:${e.isopen ? 1 : 0}`;
  }
  return String(hash_string(raw));
}
