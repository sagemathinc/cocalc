/*
These are api calls that only involve a single project.  A project-specific
API key should be enough to allow them.
*/

import { apiCall } from "./call";

// Starts a project running.
export async function start(opts: { project_id: string }) {
  return await apiCall("v2/projects/start", opts);
}

// Stops project.  Note that there are many things that could start
// it, e.g., something trying to connect, so it might just start again.
export async function stop(opts: { project_id: string }) {
  return await apiCall("v2/projects/stop", opts);
}

// Starts project running and resets idle timeout.
export async function touch(opts: { project_id: string }) {
  return await apiCall("v2/projects/touch", opts);
}
