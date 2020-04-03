/*
Functionality that mainly involves working with a specific project.
*/

import { encode_path } from "smc-util/misc2";
import * as message from "smc-util/message";

export class ProjectClient {
  private async_call: Function;

  constructor(async_call: Function) {
    this.async_call = async_call;
  }

  private async call(message: object): Promise<any> {
    return await this.async_call({ message });
  }

  public async write_text_file(opts: {
    project_id: string;
    path: string;
    content: string;
  }): Promise<void> {
    return await this.call(message.write_text_file_to_project(opts));
  }

  public async read_text_file(opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): Promise<string> {
    return (await this.call(message.read_text_file_from_project(opts))).content;
  }

  // Like "read_text_file" above, except the callback
  // message gives a url from which the file can be
  // downloaded using standard AJAX.
  public read_file(opts: {
    project_id: string; // string or array of strings
    path: string; // string or array of strings
  }): string {
    const base = (window as any).app_base_url ?? "";
    if (opts.path[0] === "/") {
      // absolute path to the root
      opts.path = ".smc/root" + opts.path; // use root symlink, which is created by start_smc
    }
    return encode_path(`${base}/${opts.project_id}/raw/${opts.path}`);
  }

  public async copy_path_between_projects(opts: {
    public?: boolean; // TODO: should get deprecated because of share server.
    src_project_id: string; // id of source project
    src_path: string; // relative path of director or file in the source project
    target_project_id: string; // if of target project
    target_path?: string; // defaults to src_path
    overwrite_newer?: boolean; // overwrite newer versions of file at destination (destructive)
    delete_missing?: boolean; // delete files in dest that are missing from source (destructive)
    backup?: boolean; // make ~ backup files instead of overwriting changed files
    timeout?: number; // how long to wait for the copy to complete before reporting "error" (though it could still succeed)
  }): Promise<void> {
    const is_public = opts.public;
    delete opts.public;

    if (opts.target_path == null) {
      opts.target_path = opts.src_path;
    }

    const mesg = is_public
      ? message.copy_public_path_between_projects(opts)
      : message.copy_path_between_projects(opts);

    await this.async_call({
      timeout: opts.timeout,
      message: mesg,
      allow_post: false, // since it may take too long
    });
  }

  // Set a quota parameter for a given project.
  // As of now, only user in the admin group can make these changes.
  public async set_quotas(opts: {
    project_id: string;
    memory?: number; // see message.js for the units, etc., for all these settings
    memory_request?: number;
    cpu_shares?: number;
    cores?: number;
    disk_quota?: number;
    mintime?: number;
    network?: number;
    member_host?: number;
  }): Promise<void> {
    await this.call(message.project_set_quotas(opts));
  }
}
