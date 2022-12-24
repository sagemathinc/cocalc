import { Icon } from "@cocalc/frontend/components";
import { TYPE_TO_ICON } from "../index";
import { Divider } from "antd";

export default function topMenu({ name, view }) {
  return {
    label: name,
    key: "top-menu",
    icon: <Icon name={TYPE_TO_ICON[view]} />,
    children: [
      {
        type: "group",
        label: <Divider>Edit</Divider>,
        children: [
          {
            label: "Rename view",
            key: "rename",
          },
          {
            label: "Edit view description",
            key: "description",
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
        label: <Divider>Other</Divider>,
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
        label: <Divider>Download</Divider>,
        children: [
          {
            label: "Download CSV",
            key: "csv",
          },
          {
            label: "Download JSON",
            key: "json",
          },
        ],
      },
    ],
  };
}
