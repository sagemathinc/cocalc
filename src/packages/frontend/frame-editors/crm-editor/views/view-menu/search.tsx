import { FilterOutlined } from "@ant-design/icons";
import { Input, Select, Space } from "antd";

export default function searchMenu({ columns }) {
  return {
    label: "Search",
    key: "SubMenu",
    icon: <FilterOutlined />,
    children: columns.map(({ dataIndex, title }) => {
      return {
        disabled: true,
        label: <Filter field={dataIndex} title={title} />,
        key: `filter-name-${dataIndex}`,
      };
    }),
  };
}

function Filter({ field, title }) {
  return (
    <Space style={{ width: "100%", color: "#666" }}>
      <div
        style={{
          overflowX: "auto",
          textOverflow: "ellipsis",
          width: "100px",
        }}
      >
        {title}
      </div>
      <Select
        size="small"
        defaultValue="contains"
        style={{ width: "150px" }}
        options={[
          {
            value: "contains",
            label: "contains",
          },
          {
            value: "does not contain",
            label: "does not contain",
          },
          {
            value: "is",
            label: "is",
          },
          {
            value: "is not",
            label: "is not",
          },
        ]}
      />
      <Input
        size="small"
        style={{ width: "100%" }}
        onChange={() => {
          console.log("change filter for ", field);
        }}
      />
    </Space>
  );
}
