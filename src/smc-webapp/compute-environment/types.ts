/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


export interface ComputeEnvironment {
  inventory?: any;
  components?: any;
  langs?: string[];
  selected_lang: string;
  loading: boolean;
}