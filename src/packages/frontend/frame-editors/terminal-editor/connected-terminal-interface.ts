/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ProjectActions } from "@cocalc/frontend/app-framework";
import { ConnectionStatus } from "../frame-tree/types";

// The sole use of this is to sync up the "mock" interface for the small standalone terminal in flyout/files-terminal.ts
export interface ConnectedTerminalInterface {
  path: string;
  project_id: string;

  get_term_env(): { [envvar: string]: string };
  set_title(id: string, title: string): void;
  set_connection_status(id: string, status: ConnectionStatus): void;
  set_terminal_cwd(id: string, cwd: string): void;

  pause(id: string): void;
  unpause(id: string): void;

  // e.g. when "bursts" happen, this is called
  set_status(mesg: string): void;
  set_error(mesg: string): void;

  // called by keyboard shortcuts
  decrease_font_size(id: string): void;
  increase_font_size(id: string): void;

  _tree_is_single_leaf(): boolean;
  close_frame(id: string): void;

  _get_project_actions(): ProjectActions;
  open_code_editor_frame(opts: {
    path: string;
    dir?;
    first?: boolean;
    pos?: number;
    compute_server_id?: number;
  });

  store?;
  setState?;
}
