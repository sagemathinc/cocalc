import { ReactNode, useMemo, useState } from "react";
import { Alert, Card, Space } from "antd";
import { Virtuoso } from "react-virtuoso";
import type { ColumnsType } from "../fields";
import { OneCard } from "./gallery";
import { getFieldSpec } from "../fields";
import { capitalize } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import set from "../querydb/set";
import { Loading } from "@cocalc/frontend/components";

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
  const [error, setError] = useState<string>("");
  const [moving, setMoving] = useState<any>(null);
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
    setMoving(null);
    if (!categoryField) return {};
    const optionToColumn: { [option: string]: number } = {};
    const categorizedData: { data: any[]; category: string }[] = [
      { data: [], category: "NULL" },
    ];
    const idToRecord: any = {};
    for (let i = 0; i < options.length; i++) {
      optionToColumn[options[i]] = i + 1;
      categorizedData.push({ data: [], category: options[i] });
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
      onDragEnd={async (args) => {
        // TODO: we're assuming a non-compound primary key here!
        setDragId(null);
        setError("");
        setMoving(null);
        const id = args.active.id;
        const category = args.over?.id;
        if (idToRecord[id][categoryField] == category) {
          // no change
          return;
        }
        const dbtable = Object.keys(query)[0];
        setMoving(id);
        try {
          await set({ [dbtable]: { [rowKey]: id, [categoryField]: category } });
        } catch (err) {
          setError(`${err}`);
          setMoving(null);
        }
      }}
    >
      <Card title={title} style={{ width: "100%" }}>
        {error && (
          <Alert
            type="error"
            message="Database Query Error"
            description={error}
          />
        )}
        <DragOverlay>
          {dragId != null && (
            <>
              <OneCard
                elt={idToRecord?.[dragId]}
                rowKey={rowKey}
                columns={columns}
                allColumns={allColumns}
                style={{ ...style, border: `1px solid ${DROP_COLOR}` }}
                DragHandle={({ children }) => (
                  <Space style={{ width: "100%" }}>
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
                    {children}
                  </Space>
                )}
              />
            </>
          )}
        </DragOverlay>
        <div style={{ width: "100%", display: "flex", overflowX: "hidden" }}>
          {!categoryField && <div>Select a category field above</div>}
          {categoryField &&
            categorizedData?.map(({ data, category }) => {
              return (
                <Droppable id={category} key={category}>
                  <div
                    key="title"
                    style={{
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "11pt",
                      marginBottom: "10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {capitalize(category)} ({data.length})
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
                    itemContent={(index) => {
                      const id = data[index][rowKey];
                      if (id == moving) {
                        return (
                          <div
                            style={{
                              height: recordHeight,
                              margin: "5%",
                              border: "1px solid #f0f0f0",
                              borderRadius: "8px",
                              background: "white",
                            }}
                          >
                            <Loading
                              delay={0}
                              text="Moving..."
                              theme="medium"
                            />
                          </div>
                        );
                      }
                      if (dragId == null || dragId != id) {
                        return (
                          <DraggableCard
                            key={id}
                            id={id}
                            elt={data[index]}
                            rowKey={rowKey}
                            columns={columns}
                            allColumns={allColumns}
                            style={style}
                          />
                        );
                      }
                      return (
                        <div
                          style={{
                            height: recordHeight,
                            margin: "5%",
                            border: "1px solid #f0f0f0",
                            borderRadius: "8px",
                            background: "#f0f0f0",
                          }}
                        ></div>
                      );
                    }}
                  />
                </Droppable>
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
        DragHandle={({ children }) => (
          <Space {...listeners} {...attributes}>
            <div style={{ display: "inline-block", margin: "-10px 0 0 -5px" }}>
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
            {children}
          </Space>
        )}
      />
    </div>
  );
}

const DROP_COLOR = "#1677ff";

export function Droppable({ id, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        ...(isOver
          ? { color: DROP_COLOR, borderTop: `2px solid ${DROP_COLOR}` }
          : { borderTop: "2px solid transparent" }),
      }}
    >
      {children}
    </div>
  );
}
