/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This makes sure everything stays consistent with the sync package.
export interface ISageSession {
  close: () => void;
  is_running: () => boolean;
  init_socket: () => Promise<void>;
  call: (obj: SageCallOpts) => Promise<void>;
}

export interface SageCallOpts {
  input: {
    id?: string;
    signal?: any;
    value?: any;
    event?: any; // should be something like: string | { sage_raw_input: string };
    code?: string;
    data?: { path: string; file: string };
    preparse?: boolean;
  };
  // cb(resp) or cb(resp1), cb(resp2), etc. -- posssibly called multiple times when message is execute or 0 times
  cb: (resp: {
    error?: Error;
    pong?: boolean;
    running?: boolean;
    stderr?: string;
    done?: boolean;
  }) => void;
}
