/*
These are api calls that only involve a single project.  A project-specific
API key should be enough to allow them.
*/

import { apiCall } from "./call";
import { siteUrl } from "./urls";
import { type JupyterApiOptions } from "@cocalc/util/jupyter/api-types";

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

// There's a TCP connection from some hub to the project, which has
// a limited api, which callProject exposes.  This includes:
// mesg={event:'ping'}, etc.
// See src/packages/server/projects/connection/call.ts
// We use this to implement some functions below.
async function callProject(opts: { project_id: string; mesg: object }) {
  return await apiCall("v2/projects/call", opts);
}

export async function ping(opts: { project_id: string }) {
  return await callProject({ ...opts, mesg: { event: "ping" } });
}

export async function exec(opts: {
  project_id: string;
  path?: string;
  command?: string;
  args?: string[];
  timeout?: number; // in seconds; default 10
  aggregate?: any;
  max_output?: number;
  bash?: boolean;
  err_on_exit?: boolean; // default true
}) {
  return await callProject({
    project_id: opts.project_id,
    mesg: { event: "project_exec", ...opts },
  });
}

// Returns URL of the file or directory, which you can
// download (from the postgres blob store).  It gets autodeleted.
// There is a limit of about 10MB for this.
// For text use readTextFileToProject
export async function readFile(opts: {
  project_id: string;
  path: string; // file or directory
  archive?: "tar" | "tar.bz2" | "tar.gz" | "zip" | "7z";
  ttlSeconds?: number;
}): Promise<string> {
  const { archive, data_uuid } = await callProject({
    project_id: opts.project_id,
    mesg: { event: "read_file_from_project", ...opts },
  });
  return siteUrl(
    `blobs/${opts.path}${archive ? `.${archive}` : ""}?uuid=${data_uuid}`,
  );
}

// export async function writeFileToProject(opts: {
//   project_id: string;
//   path: string; // file or directory
//   archive?: "tar" | "tar.bz2" | "tar.gz" | "zip" | "7z";
//   ttlSeconds?: number;
// }): Promise<string> {

// }

export async function writeTextFile(opts: {
  project_id: string;
  path: string;
  content: string;
}): Promise<void> {
  await callProject({
    project_id: opts.project_id,
    mesg: { event: "write_text_file_to_project", ...opts },
  });
}

export async function readTextFile(opts: {
  project_id: string;
  path: string;
}): Promise<void> {
  return await callProject({
    project_id: opts.project_id,
    mesg: { event: "read_text_file_from_project", ...opts },
  });
}

export async function jupyterExec(opts: JupyterApiOptions): Promise<object[]> {
  return (
    await callProject({
      project_id: opts.project_id,
      mesg: { event: "jupyter_execute", ...opts },
    })
  ).output;
}
