/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// static values for monitoring and project information

import { uuid } from "@cocalc/util/misc";

// uniquely identify this instance of the local hub
export const session_id = uuid();

// record when this instance started
export const start_ts = Date.now();
