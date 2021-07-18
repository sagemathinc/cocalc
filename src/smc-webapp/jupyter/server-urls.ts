/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Functions for getting or formatting url's for various backend endpoints
*/
import { join } from "path";

// TODO: seperate front specific code that uses this stuff;
// interestingly, removing "window" here triggers a problem
// with the non-standard window.app_base_path attribute
declare const window: any;

export function get_server_url(project_id: string): string {
  return join(
    window ? window.app_base_path ?? "/" : "/",
    project_id,
    "raw/.smc/jupyter"
  );
}

export function get_blob_url(
  project_id: string,
  extension: string,
  sha1: string
): string {
  return `${get_server_url(project_id)}/blobs/a.${extension}?sha1=${sha1}`;
}

export function get_logo_url(project_id: string, kernel: string): string {
  return `${get_server_url(project_id)}/kernelspecs/${kernel}/logo-64x64.png`;
}
