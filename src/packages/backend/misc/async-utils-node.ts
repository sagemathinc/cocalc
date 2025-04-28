/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { readFile, unlink } from "node:fs/promises";
import { pathExists } from "fs-extra";

export { readFile, unlink, pathExists as exists };
