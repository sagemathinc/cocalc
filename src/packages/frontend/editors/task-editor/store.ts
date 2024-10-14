/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Store } from "../../app-framework";
import type { TaskState } from "./types";

export class TaskStore extends Store<TaskState> {}
