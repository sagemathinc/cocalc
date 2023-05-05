/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import dayjs from "dayjs";
import { useMemo } from "react";

import { NewsItem } from "@cocalc/util/types/news";

export function useDateStr(
  news?: Omit<NewsItem, "text">,
  minutes = false
): string {
  const f = minutes ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";
  return useMemo(() => {
    if (news == null) return "";
    if (typeof news.date === "number") {
      return dayjs(news.date * 1000).format(f);
    } else {
      return `${news.date}`;
    }
  }, [news?.date]);
}
