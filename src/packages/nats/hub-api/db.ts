import { authFirst } from "./util";

export const db = {
  userQuery: authFirst,
  touch: authFirst,
  getLegacyTimeTravelInfo: authFirst,
  getLegacyTimeTravelPatches: authFirst,
  fileUseTimes: authFirst,
};

export interface DB {
  userQuery: (opts: {
    project_id?: string;
    account_id?: string;
    query: any;
    options?: any[];
  }) => Promise<any>;

  touch: (opts: {
    account_id?: string;
    project_id?: string;
    path?: string;
    action?: string;
  }) => Promise<void>;

  getLegacyTimeTravelInfo: (opts: {
    account_id?: string;
    project_id: string;
    path: string;
  }) => Promise<{ uuid: string; users?: string[] }>;

  // returns JSON.stringify({patches:[patch0,patch1,...]})
  getLegacyTimeTravelPatches: (opts: {
    account_id?: string;
    uuid: string;
    // you should set this to true to enable potentially very large response support
    requestMany?: boolean;
    // also, make this bigger:
    timeout?: number;
  }) => Promise<string>;

  fileUseTimes: (opts: FileUseTimesOptions) => Promise<FileUseTimesResponse>;
}

export interface FileUseTimesOptions {
  account_id?: string; // filled in automatically with user doing the request
  project_id: string;
  path: string;
  target_account_id: string; // who the request is about (default: account_id)
  limit?: number; // at most this many timestamps
  access_times?: boolean; // (default:true) if true, include access times
  edit_times?: boolean; // (default:false) if true, return edit times.
  timeout?: number;
}

export interface FileUseTimesResponse {
  target_account_id: string;
  access_times?: number[];
  edit_times?: (number | undefined)[];
}
