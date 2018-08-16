/*
Functions for getting or formatting url's for various backend endpoints
*/

declare const window: any;

export function get_server_url(project_id: string) {
  return `${window ? window.app_base_url || "" : ""}/${project_id}/raw/.smc/jupyter`;
}

export function get_blob_url(project_id: string, extension: any, sha1: string) {
  return `${get_server_url(project_id)}/blobs/a.${extension}?sha1=${sha1}`;
}

export function get_logo_url(project_id: string, kernel: any) {
  return `${get_server_url(project_id)}/kernelspecs/${kernel}/logo-64x64.png`;
}
