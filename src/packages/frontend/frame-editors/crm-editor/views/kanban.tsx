import { ReactNode, useMemo, useState } from "react";
import { Card } from "antd";
import { Virtuoso } from "react-virtuoso";
import type { ColumnsType } from "../fields";
import { OneCard } from "./gallery";
import { getFieldSpec } from "../fields";
import { capitalize } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";

interface Props {
  rowKey: string;
  data: object[];
  columns: ColumnsType[];
  allColumns: ColumnsType[];
  title: ReactNode;
  cardStyle?;
  height?;
  recordHeight?: number;
  categoryField: string;
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
    margin: "5%",
    height: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  height,
  recordHeight,
  categoryField,
}: Props) {
  const style = useMemo(() => {
    return { ...cardStyle, height: recordHeight };
  }, [cardStyle, recordHeight]);

  const options = useMemo(() => {
    if (!categoryField) return [];
    const dbtable = Object.keys(query)[0];
    const fieldSpec = getFieldSpec(dbtable, categoryField);
    if (fieldSpec.render?.type != "select") {
      throw Error("bug");
    }
    return fieldSpec.render.options;
  }, [categoryField, query]);

  const { categorizedData, idToRecord } = useMemo(() => {
    if (!categoryField) return {};
    const optionToColumn: { [option: string]: number } = {};
    const categorizedData: { data: any[]; label: string }[] = [
      { data: [], label: "NULL" },
    ];
    const idToRecord: any = {};
    for (let i = 0; i < options.length; i++) {
      optionToColumn[options[i]] = i + 1;
      categorizedData.push({ data: [], label: capitalize(options[i]) });
    }
    for (const record of data) {
      categorizedData[optionToColumn[record[categoryField]] ?? 0].data.push(
        record
      );
      idToRecord[record[rowKey]] = record;
    }
    return { categorizedData, idToRecord };
  }, [data, options, categoryField]);

  const [dragId, setDragId] = useState<any>(null);

  return (
    <DndContext
      onDragStart={(e) => setDragId(e.active.id)}
      onDragEnd={() => setDragId(null)}
    >
      <Card title={title} style={{ width: "100%" }}>
        <DragOverlay>
          {dragId != null && (
            <>
              <OneCard
                elt={idToRecord?.[dragId]}
                rowKey={rowKey}
                columns={columns}
                allColumns={allColumns}
                style={style}
                dragHandle={
                  <div
                    style={{
                      display: "inline-block",
                      margin: "-10px 0 0 -5px",
                    }}
                  >
                    <Icon
                      key="first"
                      name="ellipsis"
                      rotate="90"
                      style={{ margin: "10px -15px 0 0", fontSize: "20px" }}
                    />
                    <Icon
                      key="second"
                      name="ellipsis"
                      rotate="90"
                      style={{ fontSize: "20px" }}
                    />
                  </div>
                }
              />
            </>
          )}
        </DragOverlay>
        <div style={{ width: "100%", display: "flex", overflowX: "hidden" }}>
          {!categoryField && <div>Select a category field above</div>}
          {categoryField &&
            categorizedData?.map(({ data, label }) => {
              return (
                <div style={{ flex: 1 }} key={label}>
                  <div
                    key="label"
                    style={{
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "11pt",
                      marginBottom: "10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label} ({data.length})
                  </div>
                  <Virtuoso
                    overscan={500}
                    style={{
                      height: height ?? "600px",
                      width: "100%",
                      background: "#ececec",
                      border: "1px solid #ccc",
                    }}
                    data={data}
                    itemContent={(index) =>
                      dragId == null || dragId != data[index][rowKey] ? (
                        <DraggableCard
                          key={data[index][rowKey]}
                          id={data[index][rowKey]}
                          elt={data[index]}
                          rowKey={rowKey}
                          columns={columns}
                          allColumns={allColumns}
                          style={style}
                        />
                      ) : (
                        <div
                          style={{
                            height: recordHeight,
                            margin: "5%",
                            border: "1px solid #f0f0f0",
                            borderRadius: "8px",
                            background: "#f0f0f0",
                          }}
                        ></div>
                      )
                    }
                  />
                </div>
              );
            })}
        </div>
      </Card>
    </DndContext>
  );
}

/*
 */

function DraggableCard(props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: props.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <OneCard
        {...props}
        dragHandle={
          <div
            {...listeners}
            {...attributes}
            style={{ display: "inline-block", margin: "-10px 0 0 -5px" }}
          >
            <Icon
              key="first"
              name="ellipsis"
              rotate="90"
              style={{ margin: "10px -15px 0 0", fontSize: "20px" }}
            />
            <Icon
              key="second"
              name="ellipsis"
              rotate="90"
              style={{ fontSize: "20px" }}
            />
          </div>
        }
      />
    </div>
  );
}

export function Droppable(props) {
  const { isOver, setNodeRef } = useDroppable({
    id: "droppable",
  });
  const style = {
    color: isOver ? "green" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {props.children}
    </div>
  );
}
