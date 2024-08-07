/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { exec as cp_exec, spawn as cp_spawn } from "node:child_process";
import { promisify } from "node:util";
export const exec = promisify(cp_exec);
export const spawn = promisify(cp_spawn);
