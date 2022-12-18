import { useMemo, useRef, ReactNode, useCallback, useState } from "react";
import useViews, { View as ViewDescription } from "../syncdb/use-views";
import { suggest_duplicate_filename } from "@cocalc/util/misc";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Button, Card, Dropdown, Input, Popover, Space, Tabs } from "antd";
import View from "./view";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Icon, IconName } from "@cocalc/frontend/components";

export const TYPE_TO_ICON: { [type: string]: IconName } = {
  grid: "table",
  gallery: "address-card",
  calendar: "calendar",
};

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
}

const NEW = "__new__";

interface Props {
  table: string;
}

export default function Views({ table }: Props) {
  const [views, saveView, deleteView] = useViews(table);
  const { actions, id, desc } = useFrameContext();

  const getView = useCallback(
    (id: string) => {
      if (views == null) return;
      for (const view of views) {
        if (view.id == id) {
          return view;
        }
      }
    },
    [views]
  );

  const viewKey = `data-view-${table}`;
  const view = useMemo<string | undefined>(() => {
    return desc.get(viewKey, views?.[0]?.id);
  }, [desc]);

  const items = useMemo(() => {
    const createNewView = (type: string) => {
      const newView = { type, id: undefined };
      saveView(newView);
      actions.set_frame_tree({ id, [viewKey]: newView.id });
    };

    const items: TabItem[] = [];
    for (const { name, id, type } of views ?? []) {
      items.push({
        label: name,
        key: id,
        children: <View table={table} view={type} name={name} />,
      });
    }
    items.push({
      label: (
        <>
          <Icon
            name="plus-circle"
            style={{ fontSize: "15pt", margin: "0 5px 0 -24px" }}
          />{" "}
          New View...
        </>
      ),
      key: NEW,
      children: (
        <Card title="Create new view">
          <Space>
            <Button size="large" onClick={() => createNewView("grid")}>
              <Icon
                name={TYPE_TO_ICON["grid"]}
                style={{ marginRight: "15px" }}
              />{" "}
              Grid
            </Button>
            <Button size="large" onClick={() => createNewView("gallery")}>
              <Icon
                name={TYPE_TO_ICON["gallery"]}
                style={{ marginRight: "15px" }}
              />{" "}
              Gallery
            </Button>
            <Button size="large" onClick={() => createNewView("calendar")}>
              <Icon
                name={TYPE_TO_ICON["calendar"]}
                style={{ marginRight: "15px" }}
              />{" "}
              Calendar
            </Button>
          </Space>
        </Card>
      ),
    });
    return items;
  }, [views]);

  function handleDragEnd(event) {
    if (views == null) return;
    const { active, over, delta } = event;
    if (active.id !== over.id) {
      let activeIndex = 0;
      for (let j = 0; j < views.length; j++) {
        if (views[j].id == active.id) {
          activeIndex = j;
          break;
        }
      }
      for (let i = 0; i < views.length; i++) {
        if (views[i].id == over.id) {
          let pos;
          if (delta.y <= 0) {
            // before
            if (i == 0) {
              pos = views[i].pos - 1;
            } else {
              pos = (views[i].pos + views[i - 1].pos) / 2; // todo -- rescaling when too small.
            }
          } else {
            // after
            if (i == views.length - 1) {
              pos = views[i].pos + 1;
            } else {
              pos = (views[i].pos + views[i + 1].pos) / 2; // todo -- rescaling when too small.
            }
          }
          saveView({ ...views[activeIndex], pos });
          break;
        }
      }
    }
  }

  return (
    <div>
      <Tabs
        tabPosition="left"
        activeKey={view}
        onChange={(view: string) => {
          actions.set_frame_tree({ id, [viewKey]: view });
        }}
        size="small"
        items={items}
        style={{ margin: "15px" }}
        renderTabBar={(tabBarProps, DefaultTabBar) => (
          <DndContext
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={items.map((node) => node.key)}
              strategy={verticalListSortingStrategy}
            >
              <DefaultTabBar {...tabBarProps}>
                {(node) =>
                  node.key == NEW ? (
                    node
                  ) : (
                    <SortableItem
                      key={node.key}
                      id={node.key}
                      selected={view == node.key}
                      getView={getView}
                      onAction={(
                        action: "rename" | "duplicate" | "delete",
                        newName?: string
                      ) => {
                        if (node.key == null) return;
                        const view = getView(`${node.key}`);
                        if (view == null) return;
                        if (action == "duplicate") {
                          const view2: Partial<ViewDescription> = { ...view };
                          delete view2.id;
                          delete view2.pos;
                          view2.name = suggest_duplicate_filename(
                            view2.name ?? "Copy"
                          );
                          saveView(view2);
                          return;
                        } else if (action == "rename") {
                          if (newName) {
                            saveView({ ...view, name: newName });
                          }
                          return;
                        } else if (action == "delete") {
                          deleteView(view);
                          return;
                        }
                      }}
                    >
                      <Icon
                        style={{
                          fontSize: "15pt",
                          marginRight: "-15px",
                        }}
                        name={
                          TYPE_TO_ICON[
                            getView(`${node.key}`)?.type ?? "grid"
                          ] ?? "square"
                        }
                      />
                      {node}
                    </SortableItem>
                  )
                }
              </DefaultTabBar>
            </SortableContext>
          </DndContext>
        )}
      />
    </div>
  );
}

export function SortableItem({ id, children, selected, onAction, getView }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [editing, setEditing] = useState<boolean>(false);
  const inputRef = useRef<any>(null);

  // TODO: margins below and using rotated ellipsis is just cheap hack until grab a better "draggable" icon!
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {editing ? (
        <Input
          autoFocus
          ref={inputRef}
          style={{ width: "150px", marginLeft: "12px" }}
          defaultValue={getView(id)?.name}
          onBlur={() => {
            const newName = inputRef.current?.input.value;
            setEditing(false);
            onAction("rename", newName);
          }}
          onPressEnter={() => {
            const newName = inputRef.current?.input.value;
            setEditing(false);
            onAction("rename", newName);
          }}
        />
      ) : (
        <div
          style={{
            maxWidth: "150px",
            display: "inline-block",
            overflow: "hidden",
            marginRight: "10px",
            boxShadow: isDragging
              ? "0 0 0 1px rgba(63, 63, 68, 0.05), 0px 15px 15px 0 rgba(34, 33, 81, 0.25)"
              : undefined,
          }}
        >
          {children}
        </div>
      )}
      {selected && (
        <span style={{ float: "right", marginRight: "10px" }}>
          <Popover
            title={() => (
              <div style={{ maxWidth: "250px" }}>{getView(id)?.name}</div>
            )}
          >
            <Dropdown
              menu={{
                items: [
                  {
                    key: "rename",
                    label: (
                      <span onClick={() => setEditing(true)}>
                        <Icon name="edit" style={{ marginRight: "10px" }} />
                        Rename view
                      </span>
                    ),
                  },
                  {
                    key: "duplicate",
                    label: (
                      <span onClick={() => onAction("duplicate")}>
                        <Icon name="copy" style={{ marginRight: "10px" }} />
                        Duplicate view
                      </span>
                    ),
                  },
                  {
                    key: "delete",
                    label: (
                      <span
                        style={{ color: "#ff4d4f" }}
                        onClick={() => onAction("delete")}
                      >
                        <Icon name="trash" style={{ marginRight: "10px" }} />
                        Delete view
                      </span>
                    ),
                  },
                ],
              }}
            >
              <Icon name="caret-down" />
            </Dropdown>
          </Popover>
          <span {...listeners} style={{ cursor: "hand" }}>
            <Icon
              name="ellipsis"
              rotate="90"
              style={{ margin: "10px -10px 0 0" }}
            />
            <Icon name="ellipsis" rotate="90" />
          </span>
        </span>
      )}
    </div>
  );
}
