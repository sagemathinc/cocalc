import { ReactNode, useMemo } from "react";
import { Card } from "antd";
import { Virtuoso } from "react-virtuoso";
import type { ColumnsType } from "../fields";
import { OneCard } from "./gallery";
import { getFieldSpec } from "../fields";
import { capitalize } from "@cocalc/util/misc";

interface Props {
  rowKey: string;
  data: object[];
  columns: ColumnsType[];
  allColumns: ColumnsType[];
  title: ReactNode;
  cardStyle?;
  height?;
  recordHeight?: number;
  categoryKey: string;
  query: object;
}

export default function Kanban({
  query,
  rowKey,
  data,
  columns,
  allColumns,
  title,
  cardStyle = {
    width: "90%",
    height: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  height,
  recordHeight,
  categoryKey,
}: Props) {
  const style = useMemo(() => {
    return { ...cardStyle, height: recordHeight };
  }, [cardStyle, recordHeight]);

  const options = useMemo(() => {
    const dbtable = Object.keys(query)[0];
    const fieldSpec = getFieldSpec(dbtable, categoryKey);
    if (fieldSpec.render?.type != "select") {
      throw Error("bug");
    }
    return fieldSpec.render.options;
  }, [categoryKey, query]);

  const categorizedData = useMemo(() => {
    const optionToColumn: { [option: string]: number } = {};
    const categorizedData: { data: any[]; label: string }[] = [
      { data: [], label: "Not Classified" },
    ];
    for (let i = 0; i < options.length; i++) {
      optionToColumn[options[i]] = i + 1;
      categorizedData.push({ data: [], label: capitalize(options[i]) });
    }
    for (const record of data) {
      categorizedData[optionToColumn[record[categoryKey]] ?? 0].data.push(
        record
      );
    }
    return categorizedData;
  }, [data, options, categoryKey]);

  return (
    <Card title={title} style={{ width: "100%" }}>
      <div style={{ width: "100%", display: "flex", overflowX: "hidden" }}>
        {categorizedData.map(({ data, label }) => {
          return (
            <div style={{ flex: 1 }}>
              <div
                style={{
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: "11pt",
                  marginBottom: "10px",
                }}
              >
                {label}
              </div>
              <Virtuoso
                overscan={500}
                style={{
                  height: height ?? "600px",
                  width: "100%",
                  background: "#ececec",
                }}
                data={data}
                itemContent={(index) => (
                  <OneCard
                    key={data[index][rowKey]}
                    elt={data[index]}
                    rowKey={rowKey}
                    columns={columns}
                    allColumns={allColumns}
                    style={style}
                  />
                )}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
