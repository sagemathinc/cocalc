/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { useMemo } from "react";

import { NewsItem } from "@cocalc/util/types/news";

export function useDateStr(news: NewsItem, minutes = false): string {
  const f = minutes ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";
  return useMemo(
    () =>
      typeof news.date === "number"
        ? dayjs(news.date * 1000).format(f)
        : `${news.date}`,
    [news.date]
  );
}
