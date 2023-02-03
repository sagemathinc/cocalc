/*
The widths of the list of all views of a given table.

This is a single number associated to a table.  It is sync'd across
all editors of the document, since the width you choose naturally
depends on how you're naming the views, and would likely be the same
for everybody.
*/

import useRecord from "./use-record";
import { useCallback } from "react";

const DEFAULT_WIDTH = 200;

export default function useViewsWidth(
  table: string
): [width: number, setWidth: (width: number) => void] {
  const [record, setRecord] = useRecord<{
    width?: number;
  }>({
    table: "views-width", // this "table" means in the syncdb
    id: table, // id holds the actual table name
    defaultValue: { width: DEFAULT_WIDTH },
  });

  const setWidth = useCallback(
    (width: number) => {
      setRecord({ width });
    },
    [setRecord]
  );

  return [record.width ?? DEFAULT_WIDTH, setWidth];
}
