/*
Compute server hamburger menu.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown } from "antd";
import { Icon } from "@cocalc/frontend/components";

const items: MenuProps["items"] = [
  {
    key: "title-color",
    icon: <Icon name="server" />,
    label: <div style={{ color: "darkgreen" }}>Untitled 2024-04-14</div>,
  },
  {
    type: "divider",
  },
  {
    key: "control",
    icon: <Icon name="wrench" />,
    label: "Control",
    children: [
      {
        key: "start",
        icon: <Icon name="play" />,
        label: "Start",
      },
      {
        key: "suspend",
        icon: <Icon name="pause" />,
        label: "Suspend",
      },
      {
        key: "stop",
        icon: <Icon name="stop" />,
        label: "Stop",
      },
      {
        key: "reboot",
        icon: <Icon name="redo" />,
        label: "Hard Reboot",
        danger: true,
      },
      {
        key: "deprovision",
        icon: <Icon name="trash" />,
        label: "Deprovision",
        danger: true,
      },
      {
        key: "delete",
        icon: <Icon name="trash" />,
        label: "Delete",
        danger: true,
      },
    ],
  },
  {
    key: "launch",
    label: "Applications",
    icon: <Icon name="global" />,
    children: [
      {
        key: "jupyter",
        label: "Jupyter Notebook",
        icon: <Icon name="jupyter" />,
      },
      {
        key: "terminal",
        label: "Linux Terminal",
        icon: <Icon name="terminal" />,
      },
      {
        type: "divider",
      },
      {
        key: "vscode",
        label: "VS Code",
        icon: <Icon name="vscode" />,
      },
      {
        key: "jupyterlab",
        label: "JupyterLab",
        icon: <Icon name="jupyter" />,
      },
      {
        key: "x11",
        label: "X11 Desktop",
        icon: <Icon name="desktop" />,
      },
      {
        key: "pluto",
        label: "Pluto (Julia)",
        icon: <Icon name="julia" />,
      },
      {
        key: "rstudio",
        label: "R Studio",
        icon: <Icon name="r" />,
      },
    ],
  },
  {
    key: "files",
    label: "Files",
    icon: <Icon name="files" />,
    children: [
      { key: "explorer", label: "Explorer", icon: <Icon name="folder-open" /> },
      {
        type: "divider",
      },
      {
        key: "sync",
        icon: <Icon name="sync" />,
        label: "Sync Files",
      },
      {
        key: "disk",
        icon: <Icon name="disk-drive" />,
        label: "Disk Space",
      },
      {
        type: "divider",
      },
      { key: "file1", label: "foo.ipynb", icon: <Icon name="jupyter" /> },
      { key: "file2", label: "tmp/a.term", icon: <Icon name="terminal" /> },
      {
        key: "file3",
        label: "compoute-server-38/foo-bar.ipynb",
        icon: <Icon name="jupyter" />,
      },
      {
        key: "file4",
        label: "compoute-server-38/example.ipynb",
        icon: <Icon name="jupyter" />,
      },
    ],
  },
  {
    key: "options",
    label: "Options",
    icon: <Icon name="settings" />,
    children: [
      {
        key: "dns",
        label: "Configure DNS...",
        icon: <Icon name="network" />,
      },
      {
        key: "ephemeral",
        label: "Ephemeral",
        icon: <Icon name="square" />,
      },
      {
        key: "restart",
        label: "Automatically Restart",
        icon: <Icon name="check-square" />,
      },
      {
        key: "collab",
        label: "Collaborator Control",
        icon: <Icon name="square" />,
      },
      {
        key: "nested",
        label: "Nested Virtualization",
        icon: <Icon name="square" />,
      },
    ],
  },
  {
    key: "logs",
    label: "Logs",
    icon: <Icon name="history" />,
    children: [
      {
        key: "log",
        icon: <Icon name="history" />,
        label: "Control and Configuration Log",
      },
      {
        key: "serial",
        icon: <Icon name="laptop" />,
        label: "Serial Console Log",
      },
    ],
  },
  {
    type: "divider",
  },
  {
    key: "edit",
    icon: <Icon name="gears" />,
    label: "Edit...",
  },
];

export default function Menu({
  style,
  fontSize,
  size,
}: {
  style?;
  fontSize?;
  size?;
}) {
  return (
    <div style={style}>
      <Dropdown menu={{ items }} trigger={["click"]}>
        <Button type="text" size={size}>
          <Icon
            name="ellipsis"
            style={{ fontSize: fontSize ?? "15pt", color: "#000" }}
            rotate="90"
          />
        </Button>
      </Dropdown>
    </div>
  );
}
