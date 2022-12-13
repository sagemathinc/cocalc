import { useMemo, useRef, ReactNode, useCallback, useState } from "react";
import useViews, { View } from "../syncdb/use-views";
import { suggest_duplicate_filename } from "@cocalc/util/misc";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Button, Dropdown, Input, Popover, Select, Space, Tabs } from "antd";
import DBTable from "../db-table";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Icon, IconName } from "@cocalc/frontend/components";

const TYPE_TO_ICON: { [type: string]: IconName } = {
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

export default function TableTab(props) {
  const [views, saveView, deleteView] = useViews(props.name);
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

  const viewKey = `data-view-${props.name}`;
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
        children: <DBTable {...props} view={type} />,
      });
    }
    items.push({
      label: (
        <NewView
          dbtable={props.name}
          onCreate={(view: string) => {
            actions.set_frame_tree({ id, [viewKey]: view });
          }}
        />
      ),
      key: NEW,
      children: (
        <div>
          Create new view
          <br />
          <br />
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
        </div>
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
                          const view2: Partial<View> = { ...view };
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

function NewView({ dbtable, onCreate }) {
  const [value, setValue] = useState<string | null>(null);
  const [_, saveView] = useViews(dbtable);
  const options = [
    {
      value: "grid",
      label: (
        <>
          <Icon name={TYPE_TO_ICON["grid"]} style={{ marginRight: "15px" }} />{" "}
          Grid
        </>
      ),
    },
    {
      value: "gallery",
      label: (
        <>
          <Icon
            name={TYPE_TO_ICON["gallery"]}
            style={{ marginRight: "15px" }}
          />{" "}
          Gallery
        </>
      ),
    },
    {
      value: "calendar",
      label: (
        <>
          <Icon
            name={TYPE_TO_ICON["calendar"]}
            style={{ marginRight: "15px" }}
          />{" "}
          Calendar
        </>
      ),
    },
  ];
  return (
    <Select
      placeholder="New View..."
      value={value}
      options={options}
      style={{ width: "125px" }}
      onChange={(type: string) => {
        setValue(type);
        const newView = { type, id: undefined };
        saveView(newView);
        onCreate(newView.id); // id gets set on creation.
        setValue("");
      }}
    />
  );
}

export function SortableItem({ id, children, selected, onAction, getView }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

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
