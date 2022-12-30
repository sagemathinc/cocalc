import { render } from "./register";
import { Button, Popconfirm, Select, Space, Tag as AntdTag } from "antd";
import { useEditableContext } from "./context";
import { Icon, IconName } from "@cocalc/frontend/components";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { TagById } from "./tag-by-id";
import { useTags, createTag } from "../querydb/tags";
import { field_cmp } from "@cocalc/util/misc";
import { DndContext } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable } from "@dnd-kit/sortable";

render({ type: "tags", editable: false }, ({ field, obj }) => {
  const tags = obj[field];
  if (tags == null) return null;
  return (
    <div style={{ lineHeight: "2em", display: "inline-block" }}>
      {tags.map((id) => (
        <TagById id={id} key={id} />
      ))}
    </div>
  );
});

render({ type: "tags", editable: true }, ({ field, obj }) => {
  const { save, counter, error, setError } =
    useEditableContext<number[]>(field);
  const [tags, setTags] = useState<null | number[]>(obj[field]);
  const [adding, setAdding] = useState<boolean>(false);

  useEffect(() => {
    setTags(obj[field]);
  }, [counter, obj[field]]);

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id == over.id || tags == null) return;
    const oldIndex = tags.indexOf(active.id);
    const newIndex = tags.indexOf(over.id);

    const newTags = arrayMove(tags, oldIndex, newIndex);
    setTags(newTags);
    try {
      await save(obj, newTags);
    } catch (_) {
      // revert
      setTags(obj[field]);
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {tags != null && tags.length > 0 && (
        <DndContext onDragEnd={handleDragEnd}>
          <SortableContext items={tags}>
            <div style={{ lineHeight: "2em", display: "inline-block" }}>
              {tags.map((id) => (
                <SortableTagById
                  key={id}
                  confirm
                  id={id}
                  onClose={async () => {
                    const newTags = tags.filter((tag) => tag != id);
                    setTags(newTags);
                    try {
                      await save(obj, newTags);
                    } catch (_) {
                      // failed -- revert the change at the UI level.
                      setTags(obj[field]);
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {error}
      {!adding && (
        <Button
          size="small"
          style={{ color: "#888" }}
          onClick={() => setAdding(true)}
        >
          Tags...
        </Button>
      )}
      {adding && (
        <AddTags
          currentTags={tags}
          onBlur={async (addedTags: string[]) => {
            setAdding(false);
            if (addedTags.length == 0) {
              return;
            }
            const newTags = new Set<number>(tags);
            // create any tags given by non-numerical strings:
            for (const tag of addedTags) {
              const id = parseInt(tag);
              if (isFinite(id)) {
                newTags.add(id);
              } else {
                try {
                  newTags.add(await createTag(tag));
                } catch (err) {
                  setError(`${err}`);
                  return;
                }
              }
            }

            const v = Array.from(newTags);
            setTags(v);
            try {
              await save(obj, v);
            } catch (_) {
              // failed -- revert the change at the UI level.
              setTags(obj[field]);
            }
          }}
        />
      )}
    </Space>
  );
});

function SortableTagById(props) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: "inline-block",
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      <TagById
        {...props}
        Draggable={({ children }) => (
          <div
            style={{ display: "inline-block" }}
            {...attributes}
            {...listeners}
          >
            {children}
          </div>
        )}
      />
    </div>
  );
}

function AddTags({
  currentTags,
  onBlur,
}: {
  currentTags: number[] | null;
  onBlur: Function;
}) {
  const [value, setValue] = useState<any>([]);
  const tags = useTags();
  const options = useMemo(() => {
    const cur = new Set<number>(currentTags);
    const options: { label: ReactNode; value: string; name: string }[] = [];
    for (const id0 in tags) {
      const id = parseInt(id0);
      if (cur.has(id)) continue;
      options.push({
        label: <TagById id={id} />,
        value: id0,
        name: tags[id0].name.toLowerCase(),
      });
    }
    options.sort(field_cmp("name"));
    return options;
  }, [tags]);

  return (
    <Select
      autoFocus
      allowClear
      open
      options={options}
      size="small"
      value={value}
      maxTagTextLength={30 /* doesn't by-hand input size though */}
      style={{ width: "100%", minWidth: "12ex" }}
      mode="tags"
      placeholder="Select tags..."
      onBlur={() => {
        onBlur(value);
        setValue([]);
      }}
      onChange={setValue}
      tagRender={({ value, onClose }) => {
        const id = parseInt(value);
        if (isFinite(id)) {
          return <TagById id={value} onClose={onClose} />;
        } else {
          return <Tag onClose={onClose}>{value}</Tag>;
        }
      }}
      showSearch
      filterOption={(input, option) =>
        (option?.name ?? "").includes(input.toLowerCase())
      }
    />
  );
}

export function Tag({
  icon,
  color,
  children,
  onClose,
  confirm,
}: {
  icon?: IconName;
  color?: string;
  children?: ReactNode;
  onClose?: Function; // when set, makes it removable
  confirm?: boolean;
}) {
  const style = color
    ? {
        color: avatar_fontcolor(color),
        backgroundColor: color,
      }
    : undefined;
  const renderedIcon = icon ? <Icon name={icon} style={style} /> : undefined;
  const renderedTag = (
    <AntdTag style={style} icon={renderedIcon}>
      {children}
    </AntdTag>
  );
  if (onClose == null) {
    return renderedTag;
  }
  return (
    <AntdTag
      icon={renderedIcon}
      style={style}
      closable
      onClose={confirm ? (e) => e.preventDefault() : (_) => onClose()}
      closeIcon={
        confirm ? (
          <Popconfirm
            title={<>Remove the {renderedTag} tag?</>}
            onConfirm={() => {
              onClose();
            }}
            okText="Yes"
            cancelText="No"
          >
            <Icon style={style} name="times" />
          </Popconfirm>
        ) : undefined
      }
    >
      {children}
    </AntdTag>
  );
}
