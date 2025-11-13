import { redux } from "@cocalc/frontend/app-framework";
import { CLOUDS_BY_NAME, Cloud } from "@cocalc/util/db-schema/compute-servers";

// Returns true if in admin compute_servers_enabled is true *and* at least
// one cloud is also enabled, since otherwise compute servers are not in any
// way useful.  Returns false, if compute servers are not enabled or no cloud
// enabled.  Returns null if we don't know yet, since e.g., page is just loading
// and/or backend server is slow to initialize the customize store.
export function computeServersEnabled(): true | false | null {
  const customize = redux.getStore("customize");
  if (customize == null || customize.get("time") == null) {
    // definitely NOT loaded yet.
    return null;
  }
  if (!customize.get("compute_servers_enabled")) {
    return false;
  }
  for (const cloud in CLOUDS_BY_NAME) {
    if (customize.get(`compute_servers_${cloud}_enabled`)) {
      return true;
    }
  }
  return false;
}

export function cloudFilesystemsEnabled(): true | false | null {
  const customize = redux.getStore("customize");
  if (customize == null || customize.get("time") == null) {
    // definitely NOT loaded yet.
    return null;
  }
  // requires also google cloud and compute servers in general:
  return (
    !!customize.get("compute_servers_enabled") &&
    !!customize.get("compute_servers_google-cloud_enabled") &&
    !!customize.get("cloud_filesystems_enabled")
  );
}

export function availableClouds(): Cloud[] {
  const v: Cloud[] = [];
  const customize = redux.getStore("customize");
  if (customize == null) {
    return v;
  }
  for (const cloud in CLOUDS_BY_NAME) {
    if (customize.get(`compute_servers_${cloud}_enabled`)) {
      v.push(CLOUDS_BY_NAME[cloud].name);
    }
  }
  return v;
}
