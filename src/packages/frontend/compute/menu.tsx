/*
Compute server hamburger menu.
*/

import { Button, Dropdown, Spin, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { A, Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import getTitle from "./get-title";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { LogModal } from "./compute-server-log";
import { EditModal } from "./compute-server";
import { SerialLogModal } from "./serial-port-output";
import { AppLauncherModal } from "./launcher";
import { TitleColorModal } from "./title-color";
import { setServerConfiguration } from "@cocalc/frontend/compute/api";
import ShowError from "@cocalc/frontend/components/error";
import openSupportTab from "@cocalc/frontend/support/open";

function getServer({ id, project_id }) {
  return redux
    .getProjectStore(project_id)
    .getIn(["compute_servers", `${id}`])
    ?.toJS();
}

function getApps(image) {
  const IMAGES = redux.getStore("customize").get("compute_servers_images");
  if (IMAGES == null || typeof IMAGES == "string") {
    // string when error
    return {};
  }
  return (
    IMAGES.getIn([image, "apps"])?.toJS() ??
    IMAGES.getIn(["defaults", "apps"])?.toJS() ??
    {}
  );
}

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
  if (!id) {
    return [];
  }
  const server = getServer({ id, project_id });
  if (server == null) {
    return [
      {
        key: "loading",
        label: (
          <>
            Loading... (Id: {id}) <Spin />
          </>
        ),
        disabled: true,
      },
    ];
  }
  const apps = getApps(server.configuration?.image ?? "defaults");
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
            fontWeight: "bold",
            fontSize: "11pt",
            display: "flex",
            color: avatar_fontcolor(color),
            background: color,
            padding: "0 5px",
            borderRadius: "3px",
          }}
        >
          <div
            style={{
              maxWidth: "20ex",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
              marginRight: "5px",
            }}
          >
            {title}
          </div>
          (Id: {id})
        </div>
      ),
    },
    //     {
    //       type: "divider",
    //     },
    //     {
    //       key: "new-jupyter",
    //       label: "New Jupyter Notebook",
    //       icon: <Icon name="jupyter" />,
    //       disabled: server.state != "running",
    //     },
    //     {
    //       key: "new-terminal",
    //       label: "New Linux Terminal",
    //       icon: <Icon name="terminal" />,
    //       disabled: server.state != "running",
    //     },
    {
      type: "divider",
    },
    {
      key: "top-jupyterlab",
      label: "JupyterLab",
      icon: <Icon name="jupyter" />,
      disabled:
        apps["jupyterlab"] == null ||
        server.state != "running" ||
        !server.data?.externalIp,
    },
    {
      key: "top-vscode",
      label: "VS Code",
      icon: <Icon name="vscode" />,
      disabled:
        apps["vscode"] == null ||
        server.state != "running" ||
        !server.data?.externalIp,
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
      disabled: server.state != "running",
      children: [
        {
          key: "run-app-on",
          type: "group",
          label: "Run On Compute Server",
          children: [
            {
              key: "jupyterlab",
              label: "JupyterLab",
              icon: <Icon name="jupyter" />,
              disabled: apps["jupyterlab"] == null,
            },
            {
              key: "vscode",
              label: "VS Code",
              icon: <Icon name="vscode" />,
              disabled: apps["vscode"] == null,
            },
            {
              key: "xpra",
              label: "X11 Desktop",
              icon: <Icon name="desktop" />,
              disabled: apps["xpra"] == null,
            },
            //         {
            //           key: "pluto",
            //           label: "Pluto (Julia)",
            //           icon: <Icon name="julia" />,
            //         },
            //         {
            //           key: "rstudio",
            // value:"rstudio",
            //           label: "R Studio",
            //           icon: <Icon name="r" />,
            //         },
          ],
        },
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
          disabled:
            server.cloud != "google-cloud" ||
            server.state == "off" ||
            server.state == "deprovisioned",
          icon: <Icon name="laptop" />,
          label: "Serial Console Log",
        },
      ],
    },
    {
      key: "options",
      label: "Options",
      disabled: !is_owner,
      icon: <Icon name="gears" />,
      children: [
        {
          key: "run-app-on",
          type: "group",
          label: "Configure Server",
          children: [
            //             {
            //               key: "dns",
            //               label: "DNS...",
            //               icon: <Icon name="network" />,
            //             },
            {
              key: "ephemeral",
              label: "Ephemeral",
              icon: (
                <Icon
                  style={{ fontSize: "12pt" }}
                  name={
                    server.configuration?.ephemeral ? "check-square" : "square"
                  }
                />
              ),
            },
            {
              key: "allowCollaboratorControl",
              label: "Collaborator Control",
              icon: (
                <Icon
                  style={{ fontSize: "12pt" }}
                  name={
                    server.configuration?.allowCollaboratorControl
                      ? "check-square"
                      : "square"
                  }
                />
              ),
            },
            {
              type: "divider",
            },
            {
              key: "autoRestart",
              label: "Automatically Restart",
              disabled: server.cloud != "google-cloud",
              icon: (
                <Icon
                  style={{ fontSize: "12pt" }}
                  name={
                    server.configuration?.autoRestart
                      ? "check-square"
                      : "square"
                  }
                />
              ),
            },
            {
              key: "enableNestedVirtualization",
              label: "Nested Virtualization",
              disabled:
                server.cloud != "google-cloud" ||
                server.state != "deprovisioned",
              icon: (
                <Icon
                  style={{ fontSize: "12pt" }}
                  name={
                    server.configuration?.enableNestedVirtualization
                      ? "check-square"
                      : "square"
                  }
                />
              ),
            },
          ],
        },
      ],
    },
    {
      type: "divider",
    },
    {
      key: "help",
      icon: <Icon name="question-circle" />,
      label: "Help",
      children: [
        {
          key: "documentation",
          icon: <Icon name="question-circle" />,
          label: (
            <A href="https://doc.cocalc.com/compute_server.html">
              Documentation
            </A>
          ),
        },
        {
          key: "support",
          icon: <Icon name="medkit" />,
          label: "Support",
        },
        {
          key: "videos",
          icon: <Icon name="youtube" />,
          label: (
            <A href="https://www.youtube.com/playlist?list=PLOEk1mo1p5tJmEuAlou4JIWZFH7IVE2PZ">
              Videos
            </A>
          ),
        },
      ],
    },
    {
      key: "settings",
      icon: <Icon name="settings" />,
      label: is_owner ? "Settings" : "Details...",
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
  const [error, setError] = useState<string>("");
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
      onClick: async (obj) => {
        setOpen(false);
        let cmd = obj.key.startsWith("top-") ? obj.key.slice(4) : obj.key;
        switch (cmd) {
          case "control-log":
            setModal(<LogModal id={id} close={close} />);
            break;

          case "settings":
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
                name={cmd}
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

          case "ephemeral":
          case "allowCollaboratorControl":
          case "autoRestart":
          case "enableNestedVirtualization":
            const server = getServer({ id, project_id });
            if (server != null) {
              try {
                await setServerConfiguration({
                  id,
                  configuration: {
                    [cmd]: !server.configuration?.[cmd],
                  },
                });
              } catch (err) {
                setError(`${err}`);
              }
            }
            break;

          case "documentation":
            // click opens new tab anyways
            break;

          case "support":
            openSupportTab({
              type: "question",
              subject: `Compute Server (Id: ${id})`,
              body: `I am using a compute server, and have a question...`,
            });
            break;

          default:
            setError(`not implemented -- '${cmd}'`);
        }
      },
    };
  }, [id, project_id, open, title]);

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
      <ShowError
        error={error}
        setError={setError}
        style={{
          fontWeight: "normal",
          whiteSpace: "normal",
          position: "absolute",
          right: 0,
          maxWidth: "500px",
          zIndex: 1000,
          boxShadow: "2px 2px 2px 2px #bbb",
        }}
      />
    </div>
  );
}
