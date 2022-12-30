// Menu for hiding/showing fields and sorting them.
// We actually use a Popover for the menu itself, due to wanting to make it
// draggable, and interact with it in a different way than a normal menu.

import { useMemo, useState } from "react";
import { Button, Input, Popover, Space, Switch } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";
import { DndContext } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import Handle from "../../components/handle";
import { search_match, search_split } from "@cocalc/util/misc";

export default function HideFieldsMenu({
  hiddenFields,
  setHiddenField,
  columns,
  orderFields,
  setOrderFields,
  rowKey,
}) {
  const allFields = columns.map((x) => x.dataIndex);
  const label =
    hiddenFields.size == 0
      ? "Hide fields"
      : `${hiddenFields.size} Hidden ${plural(hiddenFields.size, "Field")}`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{ maxHeight: "90vh", overflow: "auto" }}
      content={
        <MenuContents
          orderFields={orderFields}
          setOrderFields={setOrderFields}
          allFields={allFields}
          hiddenFields={hiddenFields}
          setHiddenField={setHiddenField}
          columns={columns}
          rowKey={rowKey}
        />
      }
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: hiddenFields.size > 0 ? "lightblue" : undefined,
        }}
      >
        <Icon name="eye-slash" />
        {label}
      </Button>
    </Popover>
  );
}

export function columnsToFieldMap(columns) {
  const v: { [field: string]: any } = {};
  for (const column of columns) {
    v[column.dataIndex] = column;
  }
  return v;
}

function MenuContents({
  allFields,
  hiddenFields,
  setHiddenField,
  columns,
  orderFields,
  setOrderFields,
  rowKey,
}) {
  const [filter, setFilter] = useState<string>("");
  const fieldToColumns = useMemo(() => columnsToFieldMap(columns), [columns]);

  const options = useMemo(() => {
    const search = search_split(filter.toLowerCase().trim());
    return orderFields
      .filter((field) =>
        search_match(
          (fieldToColumns[field]?.title ?? "No Title").toLowerCase(),
          search
        )
      )
      .map((field) => {
        const { title } = fieldToColumns[field] ?? { title: "No Title" };
        return (
          <HideToggle
            key={`hide-field-name-${field}`}
            disabled={field == rowKey}
            field={field}
            title={title}
            hidden={hiddenFields.has(field)}
            onChange={(checked) => setHiddenField(field, !checked)}
          />
        );
      });
  }, [
    filter,
    hiddenFields,
    setHiddenField,
    orderFields,
    fieldToColumns,
    columns,
    rowKey,
  ]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id == over.id) return;
    const oldIndex = orderFields.indexOf(active.id);
    const newIndex = orderFields.indexOf(over.id);
    const newOrderFields = arrayMove(orderFields, oldIndex, newIndex);
    setOrderFields(newOrderFields);
  }

  return (
    <DndContext
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={orderFields}
        strategy={verticalListSortingStrategy}
      >
        <div>
          <Input
            autoFocus
            placeholder="Find a field..."
            onChange={(e) => setFilter(e.target.value)}
            value={filter}
          />
          <div>{options}</div>
          <HideShowAll
            rowKey={rowKey}
            key={"hide-show-all"}
            hiddenFields={hiddenFields}
            setHiddenField={setHiddenField}
            allFields={allFields}
          />
        </div>
      </SortableContext>
    </DndContext>
  );
}

function HideToggle({ disabled, field, title, hidden, onChange }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field });

  return (
    <div
      ref={setNodeRef}
      style={{
        width: "100%",
        color: "#666",
        height: "30px",
        paddingTop: "5px",
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      <div style={{ display: "inline-block" }} {...attributes} {...listeners}>
        <Handle /> {title}
      </div>
      <Switch
        disabled={disabled}
        style={{ float: "right", marginTop: "8px" }}
        size="small"
        checked={!hidden}
        onChange={onChange}
      />
    </div>
  );
}

function HideShowAll({ hiddenFields, setHiddenField, allFields, rowKey }) {
  return (
    <Space style={{ marginTop: "10px" }}>
      <Button
        type="text"
        disabled={allFields.length == hiddenFields.size + 1 /* +1 for rowKey */}
        onClick={() => {
          for (const field of allFields) {
            if (field == rowKey) continue;
            if (!hiddenFields.has(field)) {
              setHiddenField(field, true);
            }
          }
        }}
      >
        Hide All
      </Button>
      <Button
        type="text"
        style={{ float: "right" }}
        disabled={hiddenFields.size == 0}
        onClick={() => {
          for (const field of hiddenFields) {
            setHiddenField(field, false);
          }
        }}
      >
        Show All
      </Button>
    </Space>
  );
}
