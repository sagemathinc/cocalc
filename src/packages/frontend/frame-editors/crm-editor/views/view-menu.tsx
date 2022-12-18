import { useState } from "react";
import {
  AppstoreOutlined,
  MailOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Menu } from "antd";
import { TYPE_TO_ICON } from "./index";
import { Icon } from "@cocalc/frontend/components";

export default function ViewMenu({ name, view }) {
  const items: MenuProps["items"] = [
    {
      label: name,
      key: "name",
      icon: <Icon name={TYPE_TO_ICON[view]} />,
      children: [
        {
          type: "group",
          children: [
            {
              label: "Rename view",
              key: "rename",
            },
            {
              label: "Edit view description",
              key: "description",
            },
          ],
        },
        {
          type: "group",
          children: [
            {
              label: "Duplicate view",
              key: "duplicate",
            },
            {
              label: "Copy another view's configuration",
              key: "copy",
            },
          ],
        },
        {
          type: "group",
          children: [
            {
              label: "Download CSV",
              key: "csv",
            },
            {
              label: "Download JSON",
              key: "json",
            },
            {
              label: "Delete view",
              key: "delete",
            },
          ],
        },
      ],
    },
    {
      label: "Hide fields",
      key: "hide",
      icon: <AppstoreOutlined />,
    },
    {
      label: "Filter",
      key: "SubMenu",
      icon: <SettingOutlined />,
      children: [
        {
          type: "group",
          label: "Item 1",
          children: [
            {
              label: "Option 1",
              key: "setting:1",
            },
            {
              label: "Option 2",
              key: "setting:2",
            },
          ],
        },
        {
          type: "group",
          label: "Item 2",
          children: [
            {
              label: "Option 3",
              key: "setting:3",
            },
            {
              label: "Option 4",
              key: "setting:4",
            },
          ],
        },
      ],
    },
    {
      label: "Group",
      key: "group",
    },
    {
      label: "Sort",
      key: "sort",
    },
  ];

  const [current, setCurrent] = useState("mail");

  const onClick: MenuProps["onClick"] = (e) => {
    console.log("click ", e);
    setCurrent(e.key);
  };

  return (
    <Menu
      onClick={onClick}
      selectedKeys={[current]}
      mode="horizontal"
      items={items}
    />
  );
}
