/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { exec as child_process_exec } from "child_process";
import { promisify } from "util";
export const exec = promisify(child_process_exec);
