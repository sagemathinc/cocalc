/*
Compute server hamburger menu.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import getTitle from "./get-title";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LogModal } from "./compute-server-log";
import { EditModal } from "./compute-server";
import { SerialLogModal } from "./serial-port-output";
import { AppLauncherModal } from "./launcher";
import { TitleColorModal } from "./title-color";

function getItems({
  id,
  project_id,
  account_id,
  title,
  color,
}: {
  id: number;
  project_id: string;
  account_id: string;
  title?: string;
  color?: string;
}): MenuProps["items"] {
  const computeServers = redux
    .getProjectStore(project_id)
    .get("compute_servers");
  const server = computeServers?.get(`${id}`)?.toJS();
  if (server == null) {
    return [];
  }
  const is_owner = account_id == server.account_id;

  // will be used for start/stop/etc.
  // const is_collab = is_owner || server.configuration?.allowCollaboratorControl;

  return [
    {
      key: "title-color",
      icon: <Icon name="server" />,
      disabled: !is_owner,
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
    //     {
    //       key: "control",
    //       icon: <Icon name="wrench" />,
    //       label: "Control",
    //       children: [
    //         {
    //           key: "start",
    //           icon: <Icon name="play" />,
    //           label: "Start",
    //         },
    //         {
    //           key: "suspend",
    //           icon: <Icon name="pause" />,
    //           label: "Suspend",
    //         },
    //         {
    //           key: "stop",
    //           icon: <Icon name="stop" />,
    //           label: "Stop",
    //         },
    //         {
    //           key: "reboot",
    //           icon: <Icon name="redo" />,
    //           label: "Hard Reboot",
    //           danger: true,
    //         },
    //         {
    //           key: "deprovision",
    //           icon: <Icon name="trash" />,
    //           label: "Deprovision",
    //           danger: true,
    //         },
    //         {
    //           key: "delete",
    //           icon: <Icon name="trash" />,
    //           label: "Delete",
    //           danger: true,
    //         },
    //       ],
    //     },
    {
      key: "launch",
      label: "Applications",
      icon: <Icon name="global" />,
      children: [
        //         {
        //           key: "jupyter",
        //           label: "Jupyter Notebook",
        //           icon: <Icon name="jupyter" />,
        //         },
        //         {
        //           key: "terminal",
        //           label: "Linux Terminal",
        //           icon: <Icon name="terminal" />,
        //         },
        //         {
        //           type: "divider",
        //         },
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
          key: "xpra",
          label: "X11 Desktop",
          icon: <Icon name="desktop" />,
        },
        //         {
        //           key: "pluto",
        //           label: "Pluto (Julia)",
        //           icon: <Icon name="julia" />,
        //         },
        //         {
        //           key: "rstudio",
        //           label: "R Studio",
        //           icon: <Icon name="r" />,
        //         },
      ],
    },
    //     {
    //       key: "files",
    //       label: "Files",
    //       icon: <Icon name="files" />,
    //       children: [
    //         {
    //           key: "explorer",
    //           label: "Explorer",
    //           icon: <Icon name="folder-open" />,
    //         },
    //         {
    //           type: "divider",
    //         },
    //         {
    //           key: "sync",
    //           icon: <Icon name="sync" />,
    //           label: "Sync Files",
    //         },
    //         {
    //           key: "disk",
    //           icon: <Icon name="disk-drive" />,
    //           label: "Disk Space",
    //         },
    //         {
    //           type: "divider",
    //         },
    //         { key: "file1", label: "foo.ipynb", icon: <Icon name="jupyter" /> },
    //         { key: "file2", label: "tmp/a.term", icon: <Icon name="terminal" /> },
    //         {
    //           key: "file3",
    //           label: "compoute-server-38/foo-bar.ipynb",
    //           icon: <Icon name="jupyter" />,
    //         },
    //         {
    //           key: "file4",
    //           label: "compoute-server-38/example.ipynb",
    //           icon: <Icon name="jupyter" />,
    //         },
    //       ],
    //     },

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
      key: "options",
      label: "Options",
      disabled: !is_owner,
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
      type: "divider",
    },
    {
      key: "edit",
      icon: <Icon name="gears" />,
      label: is_owner ? "Edit..." : "Details...",
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
  const [open, setOpen] = useState<boolean>(false);
  const account_id = useTypedRedux("account", "account_id");
  const [modal, setModal] = useState<any>(null);
  const close = () => setModal(null);
  const [title, setTitle] = useState<{ title: string; color: string } | null>(
    null,
  );
  const { items, onClick } = useMemo(() => {
    if (!open) {
      return { onClick: () => {}, items: [] };
    }

    (async () => {
      setTitle(await getTitle(id));
    })();

    return {
      items: getItems({ ...title, id, project_id, account_id }),
      onClick: (obj) => {
        switch (obj.key) {
          case "control-log":
            setModal(<LogModal id={id} close={close} />);
            break;

          case "edit":
            setModal(
              <EditModal id={id} project_id={project_id} close={close} />,
            );
            break;

          case "serial-console-log":
            setModal(
              <SerialLogModal
                id={id}
                title={title?.title ?? ""}
                close={close}
              />,
            );
            break;

          case "vscode":
          case "jupyterlab":
          case "xpra":
            setModal(
              <AppLauncherModal
                name={obj.key}
                id={id}
                project_id={project_id}
                close={close}
              />,
            );
            break;

          case "title-color":
            setModal(
              <TitleColorModal id={id} project_id={project_id} close={close} />,
            );
            break;

          default:
            console.log(`not implemented -- '${obj.key}'`);
        }
      },
    };
  }, [open, title]);

  return (
    <div style={style}>
      <Dropdown
        menu={{ items, onClick }}
        trigger={["click"]}
        onOpenChange={setOpen}
      >
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
