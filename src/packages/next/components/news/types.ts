/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { NewsType } from "@cocalc/util/types/news";

export interface NewsWithFuture extends NewsType {
  future: boolean;
}
