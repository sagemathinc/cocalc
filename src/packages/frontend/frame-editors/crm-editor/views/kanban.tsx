import { ReactNode, useMemo, useState } from "react";
import { Alert, Card } from "antd";
import { Virtuoso } from "react-virtuoso";
import type { ColumnsType } from "../fields";
import { OneCard } from "./gallery";
import { getFieldSpec } from "../fields";
import { capitalize } from "@cocalc/util/misc";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import set from "../querydb/set";
import { Loading } from "@cocalc/frontend/components";
import Handle from "../components/handle";

interface Props {
  rowKey: string;
  data: object[];
  columns: ColumnsType[];
  title: ReactNode;
  cardStyle?;
  recordHeight?: number;
  categoryField: string;
  query: object;
  refresh: () => void;
}

const cardMargin = 2.5;
const CARD_MARGIN = `${cardMargin}%`;

export default function Kanban({
  query,
  rowKey,
  data,
  columns,
  title,
  cardStyle = {
    width: `${100 - cardMargin * 2}%`,
    margin: CARD_MARGIN,
    height: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  recordHeight,
  categoryField,
  refresh,
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
          refresh();
        } catch (err) {
          setError(`${err}`);
          setMoving(null);
        }
      }}
    >
      <Card
        title={title}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
        bodyStyle={{ flex: 1, padding: 0 }}
      >
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
                style={{ ...style, border: `1px solid ${DROP_COLOR}` }}
                Title={Title}
              />
            </>
          )}
        </DragOverlay>
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            overflowX: "hidden",
          }}
        >
          {!categoryField && (
            <Alert
              showIcon
              style={{ height: "fit-content", margin: "auto" }}
              type="error"
              message="Select a category field above, if available."
            />
          )}
          {categoryField &&
            categorizedData?.map(({ data, category }) => {
              return (
                <DroppableColumn id={category} key={category}>
                  <div
                    key="title"
                    style={{
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "11pt",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {capitalize(category)} ({data.length})
                  </div>
                  <Virtuoso
                    overscan={500}
                    style={{
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
                              margin: CARD_MARGIN,
                              border: "1px solid #f0f0f0",
                              borderRadius: "8px",
                              background: "#f8f8f8",
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
                            style={style}
                          />
                        );
                      }
                      return (
                        <div
                          style={{
                            height: recordHeight,
                            margin: CARD_MARGIN,
                            border: "1px solid #f0f0f0",
                            borderRadius: "8px",
                            background: "#f8f8f8",
                          }}
                        ></div>
                      );
                    }}
                  />
                </DroppableColumn>
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
        Title={({ children }) => (
          <div {...listeners} {...attributes}>
            <Title>{children}</Title>
          </div>
        )}
      />
    </div>
  );
}

function Title({ children }) {
  return (
    <div
      style={{
        display: "flex",
        background: "#f8f8f8",
        padding: "10px 5px 5px 5px",
        borderRadius: "8px",
        cursor: "move",
      }}
    >
      <Handle />
      {children}
    </div>
  );
}

const DROP_COLOR = "#1677ff";

export function DroppableColumn({ id, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        height: "100%",
        display: "flex",
        flex: 1,
        flexDirection: "column",
        ...(isOver
          ? { color: DROP_COLOR, borderTop: `2px solid ${DROP_COLOR}` }
          : { borderTop: "2px solid transparent" }),
      }}
    >
      {children}
    </div>
  );
}
