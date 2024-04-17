/*
Compute server hamburger menu.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useEffect, useState } from "react";
import getTitle from "./get-title";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

import { LogModal } from "./compute-server-log";
import { EditModal } from "./compute-server";
import { SerialLogModal } from "./serial-port-output";

function getItems(x): MenuProps["items"] {
  if (x == null) {
    return [];
  }
  const { title, color } = x;
  return [
    {
      key: "title-color",
      icon: <Icon name="server" />,
      label: (
        <div
          style={{
            color: avatar_fontcolor(color),
            background: color,
            padding: "0 5px",
            borderRadius: "3px",
          }}
        >
          {title}
        </div>
      ),
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
        {
          key: "explorer",
          label: "Explorer",
          icon: <Icon name="folder-open" />,
        },
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
          key: "control-log",
          icon: <Icon name="history" />,
          label: "Control and Configuration Log",
        },
        {
          key: "serial-console-log",
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
}

export default function Menu({
  id,
  project_id,
  style,
  fontSize,
  size,
}: {
  id: number;
  project_id: string;
  style?;
  fontSize?;
  size?;
}) {
  const [modal, setModal] = useState<any>(null);
  const [title, setTitle] = useState<{ title: string; color: string } | null>(
    null,
  );
  useEffect(() => {
    (async () => {
      setTitle(await getTitle(id));
    })();
  }, []);

  const items = getItems(title);
  const close = () => setModal(null);

  const onClick = (obj) => {
    switch (obj.key) {
      case "control-log":
        setModal(<LogModal id={id} close={close} />);
        break;

      case "edit":
        setModal(<EditModal id={id} project_id={project_id} close={close} />);
        break;

      case "serial-console-log":
        setModal(<SerialLogModal id={id} title={title?.title ?? ""} close={close} />);
        break;

      default:
        console.log(`not implemented -- '${obj.key}'`);
    }
  };

  return (
    <div style={style}>
      <Dropdown menu={{ items, onClick }} trigger={["click"]}>
        <Tooltip title="Customize and control server">
          <Button type="text" size={size}>
            <Icon
              name="ellipsis"
              style={{ fontSize: fontSize ?? "15pt", color: "#000" }}
              rotate="90"
            />
          </Button>
        </Tooltip>
      </Dropdown>
      {modal}
    </div>
  );
}
