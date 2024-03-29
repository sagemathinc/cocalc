/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Store } from "../../app-framework";
import { TaskState } from "./types";

export class TaskStore extends Store<TaskState> {}
