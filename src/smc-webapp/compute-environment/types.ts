/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

export interface ComputeEnvironmentState {
  inventory?: Map<string, Map<string, string | Map<string, any>>>;
  components?: Map<string, Map<string, string | Map<string, any>>>;
  langs?: string[];
  selected_lang: string;
  loading: boolean;
}
