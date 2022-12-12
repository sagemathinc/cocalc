import { useMemo, ReactNode, useState } from "react";
import useViews from "./syncdb/use-views";
import { capitalize } from "@cocalc/util/misc";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Select, Tabs } from "antd";
import DBTable from "./db-table";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DndContext } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

interface TabItem {
  label: ReactNode;
  key: string;
  children: ReactNode;
}

const NEW = "__new__";

export default function TableTab(props) {
  const [views, setView] = useViews(props.name);
  const { actions, id, desc } = useFrameContext();

  const viewKey = `data-view-${props.name}`;
  const view = useMemo<string | undefined>(() => {
    return desc.get(viewKey, views?.[0]?.id);
  }, [desc]);

  const items = useMemo(() => {
    const items: TabItem[] = [];
    for (const { name, id, type } of views ?? []) {
      items.push({
        label: capitalize(name),
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
      children: <div style={{ color: "#888" }}>Create a new view.</div>,
    });
    return items;
  }, [views]);

  function handleDragEnd(event) {
    if (views == null) return;
    const { active, over } = event;
    if (active.id !== over.id) {
      console.log("move ", active.id, " to be right before ", over.id);
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
          if (i == 0) {
            pos = views[i].pos - 1;
          } else {
            pos = (views[i].pos + views[i - 1].pos) / 2; // todo -- rescaling when too small.
          }
          setView({ ...views[activeIndex], pos });
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
                    <SortableItem key={node.key} id={node.key}>
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
  const [_, setView] = useViews(dbtable);
  const options = [
    { value: "table", label: "Grid" },
    { value: "cards", label: "Gallery" },
    { value: "calendar", label: "Calendar" },
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
        setView(newView);
        onCreate(newView.id); // id gets set on creation.
        setValue("");
      }}
    />
  );
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function SortableItem(props) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {props.children}
    </div>
  );
}
