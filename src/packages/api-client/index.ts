import { apiKey, apiServer, apiBasePath } from "@cocalc/backend/data";
import { join } from "path";
import { dynamicImport } from "tsimportlib";

function apiUrl(path: string): string {
  if (!apiServer) {
    throw Error("API_SERVER must be specified");
  }
  return `${apiServer}${join(apiBasePath, path)}`;
}

export async function apiCall(
  endpoint: string,
  params: object
): Promise<object> {
  const got = (await dynamicImport("got", module))
    .default as typeof import("got").default;
  const url = apiUrl(join("api", endpoint));
  return await got.post(url, { username: apiKey, json: params }).json();
}

// Starts a project running.
export async function startProject(opts: { project_id: string }) {
  return await apiCall("v2/projects/start", opts);
}

// Stops project.  Note that there are many things that could start
// it, e.g., something trying to connect, so it might just start again.
export async function stopProject(opts: { project_id: string }) {
  return await apiCall("v2/projects/stop", opts);
}

// Starts project running and resets idle timeout.
export async function touchProject(opts: { project_id: string }) {
  return await apiCall("v2/projects/touch", opts);
}

// There's a TCP connection from some hub to the project, which has
// a limited api, which callProject exposes.  This includes:
// mesg={event:'ping'}, etc.
// See src/packages/server/projects/connection/call.ts
// We use this to implement some functions below.
export async function callProject(opts: { project_id: string; mesg: object }) {
  return await apiCall("v2/projects/call", opts);
}

export async function pingProject(opts: { project_id: string }) {
  return await callProject({ ...opts, mesg: { event: "ping" } });
}

//export async function execInProject(opts:{project_id:string, })
