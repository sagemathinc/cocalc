// Menu for hiding/showing fields and sorting them.
// We actually use a Popover for the menu itself, due to wanting to make it
// draggable, and interact with it in a different way than a normal menu.

import { Button, Popover, Space, Switch } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";

export default function hideFieldsMenu({
  hiddenFields,
  setHiddenField,
  columns,
}) {
  const allFields = columns.map((x) => x.dataIndex);

  const label = (
    <Popover
      content={
        <MenuContents
          allFields={allFields}
          hiddenFields={hiddenFields}
          setHiddenField={setHiddenField}
          columns={columns}
        />
      }
      trigger="click"
    >
      {hiddenFields.size == 0 ? (
        "Hide fields"
      ) : (
        <span style={{ backgroundColor: "lightblue", padding: "5px" }}>
          {hiddenFields.size} Hidden {plural(hiddenFields.size, "Field")}
        </span>
      )}
    </Popover>
  );

  return {
    label,
    key: "hide",
    icon: <Icon name="eye-slash" />,
    children: [],
  };
}

function MenuContents({ allFields, hiddenFields, setHiddenField, columns }) {
  const options = columns
    .map(({ dataIndex: field, title }) => (
      <div
        key={`hide-field-name-${field}`}
        style={{ height: "30px", paddingTop: "5px" }}
      >
        <HideToggle
          title={title}
          hidden={hiddenFields.has(field)}
          onChange={(checked) => setHiddenField(field, !checked)}
        />
      </div>
    ))
    .concat([
      <HideShowAll
        key={"hide-show-all"}
        hiddenFields={hiddenFields}
        setHiddenField={setHiddenField}
        allFields={allFields}
      />,
    ]);
  return <div style={{ maxHeight: "90vh", overflow: "auto" }}>{options}</div>;
}

function HideToggle({ title, hidden, onChange }) {
  return (
    <div style={{ width: "100%", color: "#666" }}>
      {title}
      <Switch
        style={{ float: "right", marginTop: "2px" }}
        size="small"
        checked={!hidden}
        onChange={onChange}
      />
    </div>
  );
}

function HideShowAll({ hiddenFields, setHiddenField, allFields }) {
  return (
    <Space style={{marginTop:'5px'}}>
      <Button
        disabled={allFields.length == hiddenFields.size}
        onClick={() => {
          for (const field of allFields) {
            if (!hiddenFields.has(field)) {
              setHiddenField(field, true);
            }
          }
        }}
      >
        Hide All
      </Button>
      <Button
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
