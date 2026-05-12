import api from "lib/api/post";
import { join } from "path";

const POLL_INTERVAL_MS = 5_000;
// We give the backend up to 10 minutes to finish a copy before we
// surface a timeout to the user. Manage's per-rsync timeout is 7 min,
// so this leaves headroom for queueing.
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;
// Transient network blips (502, ECONNRESET, etc.) shouldn't fail the
// whole copy — the backend rsync continues regardless. We only give up
// after this many consecutive poll request failures.
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

interface CopyPublicPathOpts {
  id: string;
  path: string;
  url?: string;
  relativePath: string;
  src_project_id: string;
  target_project_id: string;
  // Called whenever we get a fresh status from the backend. `started`
  // is set as soon as the project pod / manage picks up the request.
  onProgress?: (status: { started: boolean; elapsed_s: number }) => void;
}

export default async function copyPublicPath({
  id,
  path,
  url,
  relativePath,
  src_project_id,
  target_project_id,
  onProgress,
}: CopyPublicPathOpts): Promise<void> {
  if (url) {
    await api("/projects/copy-url", {
      project_id: target_project_id,
      url,
      timeout: 60,
    });
  }

  const submitStart = Date.now();
  const submission = await api("/projects/copy-path", {
    src_project_id,
    url,
    target_project_id,
    path: join(path, relativePath),
    public_id: id,
    timeout: 7 * 60,
    wait_until_done: false,
  });
  // Self-hosted / single-user controllers run the copy synchronously
  // inside the API handler and return copy_id === "" — in that case
  // there is nothing to poll, the copy is already finished.
  const copy_id: string | undefined = submission?.copy_id;
  if (!copy_id) {
    onProgress?.({ started: true, elapsed_s: 0 });
    return;
  }

  const deadline = submitStart + MAX_POLL_DURATION_MS;
  let consecutiveErrors = 0;
  while (true) {
    if (Date.now() > deadline) {
      throw Error(
        "Copy is taking longer than 10 minutes. It may still finish " +
          "in the background — try opening your new project shortly.",
      );
    }
    let status;
    try {
      status = await api("/projects/copy-path-status", { copy_id });
      consecutiveErrors = 0;
    } catch (err) {
      // The backend copy keeps running even if our poll request blips,
      // so tolerate a few transient request failures before giving up.
      // Real copy failures come through as status.copy_error below, not
      // as apiPost throwing, so this catch is safely for transients only.
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw err;
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    onProgress?.({
      started: !!status.started,
      elapsed_s: Math.round((Date.now() - submitStart) / 1000),
    });
    if (status.finished) {
      if (status.copy_error) {
        throw Error(status.copy_error);
      }
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
