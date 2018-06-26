/*
Functions for getting or formatting url's for various backend endpoints
*/

// TODO: seperate front specific code that uses this stuff
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

export function get_complete_url(project_id: string, path: any, code: any, cursor_pos: any) {
  let s = `${get_server_url(project_id)}/kernels/complete?code=${encodeURIComponent(
    code
  )}&path=${encodeURIComponent(path)}`;
  if (cursor_pos != null) {
    s += `&cursor_pos=${encodeURIComponent(cursor_pos)}`;
  }
  return s;
}

export function get_introspect_url(
  project_id: string,
  path: any,
  code: any,
  cursor_pos: any,
  level: any
) {
  let s = `${get_server_url(project_id)}/kernels/introspect?code=${encodeURIComponent(
    code
  )}&path=${encodeURIComponent(path)}`;
  if (cursor_pos != null) {
    s += `&cursor_pos=${encodeURIComponent(cursor_pos)}`;
  }
  if (level != null) {
    s += `&level=${encodeURIComponent(level)}`;
  }
  return s;
}

export function get_store_url(project_id: string, path: any, key: any, value: any) {
  let s = `${get_server_url(project_id)}/kernels/store?key=${encodeURIComponent(
    JSON.stringify(key)
  )}&path=${encodeURIComponent(path)}`;
  if (value != null) {
    s += `value=${encodeURIComponent(JSON.stringify(value))}`;
  }
  return s;
}

// signal should be SIGINT or SIGKILL (see https://nodejs.org/api/process.html#process_process_kill_pid_signal)
export function get_signal_url(project_id: string, path: any, signal: string) {
  return `${get_server_url(project_id)}/kernels/signal/${signal}?path=${encodeURIComponent(path)}`;
}

export function get_kernel_info_url(project_id: string, path: any) {
  return `${get_server_url(project_id)}/kernels/kernel_info?path=${encodeURIComponent(path)}`;
}

// get more output messages for the given id
export function get_more_output_url(project_id: string, path: any, id: any) {
  return `${get_server_url(project_id)}/kernels/more_output?path=${encodeURIComponent(
    path
  )}&id=${encodeURIComponent(id)}`;
}
