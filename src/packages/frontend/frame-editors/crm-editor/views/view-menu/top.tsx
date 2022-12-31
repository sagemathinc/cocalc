import { Icon } from "@cocalc/frontend/components/icon";
import { TYPE_TO_ICON } from "../index";
import { Divider, Menu, Tooltip } from "antd";

export default function TopMenu({ name, view }) {
  const items = [
    {
      label: (
        <div
          style={{
            display: "inline-block",
            maxWidth: "10em",
            overflowX: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <Icon name={TYPE_TO_ICON[view]} /> {name}
        </div>
      ),
      key: "top-menu",
      children: [
        {
          type: "group",
          label: <Divider>Properties</Divider>,
          children: [
            {
              label: "Rename view",
              key: "rename",
            },
            {
              label: "Duplicate view",
              key: "duplicate",
            },
            {
              label: "Copy another view's configuration",
              key: "copy",
            },
            {
              danger: true,
              label: "Delete view",
              key: "delete",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Import</Divider>,
          children: [
            {
              label: "Import CSV",
              key: "csv",
            },
            {
              label: "Import JSON",
              key: "json",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Export</Divider>,
          children: [
            {
              label: "Export CSV",
              key: "csv",
            },
            {
              label: "Export JSON",
              key: "json",
            },
          ],
        },
      ],
    },
  ];
  return (
    <Tooltip title={name} placement="left">
      <Menu triggerSubMenuAction={"click"} items={items} />
    </Tooltip>
  );
}
