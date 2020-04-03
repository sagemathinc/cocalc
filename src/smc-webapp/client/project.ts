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
}
