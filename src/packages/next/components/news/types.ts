/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { NewsItem } from "@cocalc/util/types/news";

export interface NewsWithFuture extends NewsItem {
  future: boolean;
}
