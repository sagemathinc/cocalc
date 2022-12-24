import { Button, Space, Switch } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";

export default function hideFieldsMenu({
  hiddenFields,
  setHiddenField,
  columns,
}) {
  const allFields = columns.map((x) => x.dataIndex);

  return {
    label:
      hiddenFields.size == 0 ? (
        "Hide fields"
      ) : (
        <span style={{ backgroundColor: "lightblue", padding: "5px" }}>
          {hiddenFields.size} Hidden {plural(hiddenFields.size, "Field")}
        </span>
      ),
    key: "hide",
    icon: <Icon name="eye-slash" />,
    children: columns
      .map(({ dataIndex: field, title }) => {
        return {
          disabled: true,
          label: (
            <HideToggle
              title={title}
              hidden={hiddenFields.has(field)}
              onChange={(checked) => setHiddenField(field, !checked)}
            />
          ),
          key: `hide-field-name-${field}`,
        };
      })
      .concat([
        {
          disabled: true,
          label: (
            <HideShowAll
              hiddenFields={hiddenFields}
              setHiddenField={setHiddenField}
              allFields={allFields}
            />
          ),
          key: "hide-show-all",
        },
      ]),
  };
}

function HideToggle({ title, hidden, onChange }) {
  return (
    <div style={{ width: "100%", color: "#666" }}>
      {title}
      <Switch
        style={{ float: "right", marginTop: "12px" }}
        size="small"
        checked={!hidden}
        onChange={onChange}
      />
    </div>
  );
}

function HideShowAll({ hiddenFields, setHiddenField, allFields }) {
  return (
    <Space>
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
