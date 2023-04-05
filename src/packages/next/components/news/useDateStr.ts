/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { useMemo } from "react";

import { NewsType } from "@cocalc/util/types/news";

export function useDateStr(news: NewsType): string {
  return useMemo(
    () =>
      typeof news.date === "number"
        ? dayjs(news.date * 1000).format("YYYY-MM-DD")
        : `${news.date}`,
    [news.date]
  );
}
