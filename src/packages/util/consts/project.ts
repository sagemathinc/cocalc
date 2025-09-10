export const DUMMY_SECRET = `[SECRET HIDDEN]`;

export const DOC_CLOUD_STORAGE_URL =
  "https://doc.cocalc.com/project-settings.html#cloud-storage-remote-file-systems";

export const PROJECT_EXEC_DEFAULT_TIMEOUT_S = 60;

export const TIMEOUT_CALLING_PROJECT = "timeout";

export const TIMEOUT_CALLING_PROJECT_MSG =
  "Timeout communicating with project.";

/**
 * Checks if an error represents a timeout when communicating with a project.
 *
 * Handles both legacy and conat-based timeout errors:
 * - Legacy: String "timeout"
 * - Conat: ConatError with code 408 (HTTP Request Timeout)
 *   See @cocalc/conat/core/client.ts lines 1391, 1937-1939 where 408 timeouts are thrown
 */
export function isTimeoutCallingProject(err): boolean {
  if (err === TIMEOUT_CALLING_PROJECT) {
    return true;
  }
  if (err?.constructor?.name === "ConatError" && err?.code === 408) {
    return true;
  }
  return false;
}
