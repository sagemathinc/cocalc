/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useState } from "@cocalc/frontend/app-framework";

export default function useTableHeight({
  tableRef,
  rootRef,
  headerRef,
  font_size,
  resize,
}) {
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    if (
      tableRef.current == null ||
      rootRef.current == null ||
      headerRef.current == null
    )
      return;
    const pagerEl = $(tableRef.current).find(".ant-pagination").first();
    const pagerHeight = pagerEl.height() ?? 0;
    const pagerMargins =
      pagerEl != null
        ? parseInt(pagerEl.css("margin-top")) +
          parseInt(pagerEl.css("margin-bottom"))
        : 0;
    const tableHeaderHeight =
      $(tableRef.current).find(".ant-table-header").first().height() ?? 0;
    const rootDivHeight = $(rootRef.current).height() ?? 0;
    const headerHeight = $(headerRef.current).height() ?? 0;
    const tableHeight =
      rootDivHeight -
      headerHeight -
      pagerHeight -
      tableHeaderHeight -
      pagerMargins;
    if (height != tableHeight) setHeight(tableHeight);
  }, [tableRef.current, font_size, resize]);

  return height;
}
