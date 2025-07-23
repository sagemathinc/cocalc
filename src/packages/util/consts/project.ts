export const DUMMY_SECRET = `[SECRET HIDDEN]`;

export const DOC_CLOUD_STORAGE_URL =
  "https://doc.cocalc.com/project-settings.html#cloud-storage-remote-file-systems";

export const PROJECT_EXEC_DEFAULT_TIMEOUT_S = 60;

export const TIMEOUT_CALLING_PROJECT = "timeout";

export const TIMEOUT_CALLING_PROJECT_MSG =
  "Timeout communicating with project.";

export const IS_TIMEOUT_CALLING_PROJECT = (err) => {
  if (err === TIMEOUT_CALLING_PROJECT) {
    return true;
  }
  return false;
};
