/*
Compute server hamburger menu.
*/

import type { MenuProps } from "antd";
import { Button, Dropdown, Spin } from "antd";
import { useMemo, useState } from "react";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import {
  setServerConfiguration,
  setTemplate,
} from "@cocalc/frontend/compute/api";
import openSupportTab from "@cocalc/frontend/support/open";
import CloneModal from "./clone";
import { EditModal } from "./compute-server";
import { LogModal } from "./compute-server-log";
import getTitle from "./get-title";
import { AppLauncherModal } from "./launcher";
import { SerialLogModal } from "./serial-port-output";
import { TitleColorModal } from "./title-color";
import { AutomaticShutdownModal } from "./automatic-shutdown";

function getServer({ id, project_id }) {
  return redux
    .getProjectStore(project_id)
    .getIn(["compute_servers", `${id}`])
    ?.toJS();
}

export function getApps(image) {
  const IMAGES = redux.getStore("customize").get("compute_servers_images");
  if (IMAGES == null || typeof IMAGES == "string") {
    // string when error
    return {};
  }
  let apps =
    IMAGES.getIn([image, "apps"])?.toJS() ??
    IMAGES.getIn(["defaults", "apps"])?.toJS() ??
    {};
  if (IMAGES.getIn([image, "jupyterKernels"]) === false) {
    apps = { ...apps, jupyterlab: undefined };
  }
  if (apps["xpra"]) {
    if (!apps["xpra"].tip) {
      apps["xpra"].tip =
        "Launch an X11 Linux Graphical Desktop environment running directly on the compute server.";
    }
  }
  return apps;
}

function getItems({
  id,
  project_id,
  account_id,
  isAdmin,
}: {
  id: number;
  project_id: string;
  account_id: string;
  title?: string;
  color?: string;
  isAdmin?: boolean;
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
            Loading... <Spin />
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

  const titleAndColor = {
    key: "title-color",
    icon: <Icon name="colors" />,
    disabled: !is_owner,
    label: "Edit Title and Color",
  };
  const automaticShutdown = {
    key: "automatic-shutdown",
    icon: <Icon name="stopwatch" />,
    disabled: server.cloud == "onprem",
    label: "Automatic Shutdown & Health Check",
  };
  const jupyterlab = {
    key: "top-jupyterlab",
    label: "JupyterLab",
    icon: <Icon name="jupyter" />,
    disabled:
      apps["jupyterlab"] == null ||
      server.state != "running" ||
      !server.data?.externalIp,
  };
  const vscode = {
    key: "top-vscode",
    label: "VS Code",
    icon: <Icon name="vscode" />,
    disabled:
      apps["vscode"] == null ||
      server.state != "running" ||
      !server.data?.externalIp,
  };
  const xpra = {
    key: "xpra",
    label: "X11 Desktop",
    icon: <Icon name="desktop" />,
    disabled:
      apps["xpra"] == null ||
      server.state != "running" ||
      !server.data?.externalIp,
  };

  const optionItems: (
    | { key: string; label; icon; disabled?: boolean }
    | { type: "divider" }
  )[] = [
    //             {
    //               key: "dns",
    //               label: "DNS...",
    //               icon: <Icon name="network" />,
    //             },
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
      key: "ephemeral",
      label: "Ephemeral",
      icon: (
        <Icon
          style={{ fontSize: "12pt" }}
          name={server.configuration?.ephemeral ? "check-square" : "square"}
        />
      ),
    },
    {
      type: "divider",
    },
  ];
  if (server.cloud == "google-cloud") {
    optionItems.push({
      key: "autoRestart",
      label: "Automatically Restart",
      disabled: server.cloud != "google-cloud",
      icon: (
        <Icon
          style={{ fontSize: "12pt" }}
          name={server.configuration?.autoRestart ? "check-square" : "square"}
        />
      ),
    });
    optionItems.push({
      key: "enableNestedVirtualization",
      label: "Nested Virtualization",
      disabled:
        server.cloud != "google-cloud" || server.state != "deprovisioned",
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
    });
  }
  if (isAdmin) {
    if (optionItems[optionItems.length - 1]?.["type"] != "divider") {
      optionItems.push({
        type: "divider",
      });
    }
    optionItems.push({
      key: "template",
      label: "Use as Template",
      icon: (
        <Icon
          style={{ fontSize: "12pt" }}
          name={server.template?.enabled ? "check-square" : "square"}
        />
      ),
    });
  }

  const options = {
    key: "options",
    label: "Options",
    disabled: !is_owner,
    icon: <Icon name="gears" />,
    children: [
      {
        key: "run-app-on",
        type: "group",
        label: "Configure Server",
        children: optionItems,
      },
    ],
  };

  const help = {
    key: "help",
    icon: <Icon name="question-circle" />,
    label: "Help",
    children: [
      {
        key: "documentation",
        icon: <Icon name="question-circle" />,
        label: (
          <A href="https://doc.cocalc.com/compute_server.html">Documentation</A>
        ),
      },
      {
        key: "support",
        icon: <Icon name="medkit" />,
        label: "Support",
      },
      {
        key: "videos",
        icon: <Icon name="youtube" style={{ color: "red" }} />,
        label: (
          <A href="https://www.youtube.com/playlist?list=PLOEk1mo1p5tJmEuAlou4JIWZFH7IVE2PZ">
            Videos
          </A>
        ),
      },
      {
        type: "divider",
      },
      {
        key: "dedicated",
        icon: <Icon name="bank" />,
        label: "Dedicated Always On Server for 6+ Months...",
      },
    ],
  };

  const settings = {
    key: "settings",
    icon: <Icon name="settings" />,
    label: is_owner ? "Settings" : "Details...",
  };

  const clone = {
    key: "clone",
    icon: <Icon name="copy" />,
    label: "Clone Server Configuration",
  };

  return [
    titleAndColor,
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
    jupyterlab,
    vscode,
    xpra,
    {
      type: "divider",
    },
    settings,
    automaticShutdown,
    //spendLimit,
    options,
    {
      type: "divider",
    },
    {
      key: "control-log",
      icon: <Icon name="history" />,
      label: "Compute Server Log",
    },
    {
      key: "serial-console-log",
      disabled:
        server.cloud != "google-cloud" ||
        server.state == "off" ||
        server.state == "deprovisioned",
      icon: <Icon name="laptop" />,
      label: "Serial Console",
    },
    {
      type: "divider",
    },
    clone,
    {
      type: "divider",
    },
    help,
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
  const [title, setTitle] = useState<{
    title: string;
    color: string;
    project_specific_id: number;
  } | null>(null);
  const isAdmin = useTypedRedux("account", "is_admin");
  const { items, onClick } = useMemo(() => {
    if (!open) {
      return { onClick: () => {}, items: [] };
    }

    (async () => {
      setTitle(await getTitle(id));
    })();
    return {
      items: getItems({ id, project_id, account_id, isAdmin }),
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

          case "clone":
            setModal(<CloneModal id={id} close={close} />);
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

          case "automatic-shutdown":
            setModal(
              <AutomaticShutdownModal
                id={id}
                project_id={project_id}
                close={close}
              />,
            );
            break;

          case "ephemeral":
          case "allowCollaboratorControl":
          case "autoRestart":
          case "enableNestedVirtualization":
          case "template":
            const server = getServer({ id, project_id });
            if (server != null) {
              try {
                if (obj.key == "template") {
                  await setTemplate({
                    id,
                    template: { enabled: !server.template?.enabled },
                  });
                } else {
                  await setServerConfiguration({
                    id,
                    configuration: {
                      [cmd]: !server.configuration?.[cmd],
                    },
                  });
                }
              } catch (err) {
                setError(`${err}`);
              }
            }
            break;

          case "documentation":
          case "videos":
            // click opens new tab anyways
            break;

          case "support":
            openSupportTab({
              type: "question",
              subject: `Compute Server (Global Id: ${id}; Project Specific Id: ${title?.project_specific_id})`,
              body: `I am using a compute server, and have a question...`,
            });
            break;

          case "dedicated":
            openSupportTab({
              type: "question",
              subject: `Compute Server (Global Id: ${id}; Project Specific Id: ${title?.project_specific_id})`,
              body: `I need a dedicated always on compute server for at least 6 months, and am interested in significant discounts.\nI would love to tell you about my problem, and see if CoCalc can help!`,
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
        <Button type="text" size={size}>
          <Icon
            name="ellipsis"
            style={{ fontSize: fontSize ?? "15pt", color: "#000" }}
            rotate="90"
          />
        </Button>
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
