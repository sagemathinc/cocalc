/* Todo: this isnt done at all! */

import { useState } from "react";
import { Button, Popover, Select, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";

export default function GroupBy({ columns }) {
  const content = [<GroupBySelector key="todo" columns={columns} />];

  // TODO!
  const groupFields = [];

  const label =
    groupFields.length == 0 ? "Group" : `Group (${groupFields.length})`;

  return (
    <Popover
      placement="bottom"
      overlayInnerStyle={{
        maxHeight: "90vh",
        maxWidth: "565px",
        overflow: "auto",
      }}
      content={<div>{content}</div>}
      trigger="click"
    >
      <Button
        type="text"
        style={{
          backgroundColor: groupFields.length > 0 ? "#e3ccf7" : undefined,
        }}
      >
        <Icon name="group" />
        {label}
      </Button>
    </Popover>
  );
}

function GroupBySelector({ columns }) {
  const [field, setField] = useState<string>("");
  const [descending, setDescending] = useState<boolean>(false);
  return (
    <Space>
      <Select
        size="small"
        style={{ width: "150px" }}
        showSearch
        placeholder="Choose a field..."
        filterOption={(input, option) =>
          ((option?.label ?? "") as string)
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        onChange={setField}
        optionFilterProp="children"
        options={columns.map(({ dataIndex, title }) => {
          return {
            value: dataIndex,
            label: title,
          };
        })}
      />
      {field && (
        <Select
          size="small"
          style={{ width: "150px" }}
          value={descending ? "descending" : "ascending"}
          onChange={(value) => {
            setDescending(value == "descending");
          }}
          options={[
            { value: "ascending", label: "Ascending" },
            { value: "descending", label: "Descending" },
          ]}
        />
      )}
    </Space>
  );
}
