/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functions for getting or formatting url's for various backend endpoints
*/
import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

// TODO: seperate front specific code that uses this stuff;
// interestingly, removing "window" here triggers a problem
// with the non-standard appBasePath attribute
declare const window: any;

export function get_server_url(project_id: string): string {
  return join(appBasePath, project_id, "raw/.smc/jupyter");
}

export function get_blob_url(
  project_id: string,
  extension: string,
  sha1: string
): string {
  return `${get_server_url(project_id)}/blobs/a.${extension}?sha1=${sha1}`;
}

// This gets data from something served from src/packages/project/jupyter/http-server.ts
export function ipywidgetsGetBufferUrl(
  project_id: string,
  path: string,
  model_id: string,
  buffer_path: string
): string {
  return `${get_server_url(
    project_id
  )}/ipywidgets-get-buffer?path=${encodeURIComponent(
    path
  )}&model_id=${encodeURIComponent(model_id)}&buffer_path=${encodeURIComponent(
    buffer_path
  )}`;
}

export function get_logo_url(project_id: string, kernel: string): string {
  return `${get_server_url(project_id)}/kernelspecs/${kernel}/logo-64x64.png`;
}
