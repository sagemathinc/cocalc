/*
Cloud filesystem menu.
*/

import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { A, Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import openSupportTab from "@cocalc/frontend/support/open";

function getItems(cloudFilesystem): MenuProps["items"] {
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
    ],
  };
  return [
    {
      danger: cloudFilesystem.mount,
      key: "mount",
      icon: <Icon name={cloudFilesystem.mount ? "stop" : "run"} />,
      label: cloudFilesystem.mount ? "Disable Automount" : "Automount",
    },
    {
      type: "divider",
    },
    {
      key: "edit-title-and-colors",
      icon: <Icon name={"colors"} />,
      label: "Title and Color",
    },
    {
      key: "edit-bucket-storage-class",
      icon: <Icon name="disk-snapshot" />,
      label: "Bucket Storage Class",
    },
    {
      key: "edit-trash-config",
      icon: <Icon name={"trash"} />,
      label: cloudFilesystem.trash_days ? "Configure Trash" : "Enable Trash",
    },
    {
      key: "edit-mount-options",
      icon: <Icon name={"database"} />,
      label: "Mount and KeyDB Options",
    },
    {
      key: "edit-lock",
      icon: <Icon name={"lock"} />,
      label: "Delete Protection",
    },
    {
      type: "divider",
    },
    {
      disabled: cloudFilesystem.mount,
      key: "edit-mountpoint",
      icon: <Icon name="folder-open" />,
      label: "Mountpoint",
    },
    {
      key: "edit-project",
      disabled: cloudFilesystem.mount,
      icon: <Icon name={"pencil"} />,
      label: "Move to Another Project",
    },
    {
      type: "divider",
    },
    {
      disabled: cloudFilesystem.mount,
      danger: true,
      key: "delete",
      icon: <Icon name="trash" />,
      label: "Delete Filesystem",
    },
    help,
  ];
}

export default function Menu({
  cloudFilesystem,
  style,
  setError,
  size,
  fontSize,
  show,
}: {
  cloudFilesystem;
  style?;
  setError;
  size?;
  fontSize?;
  show: {
    setShowMount;
    setShowEditMountpoint;
    setShowEditTitleAndColor;
    setShowDelete;
    setShowEditLock;
    setShowEditTrashDays;
    setShowEditBucketStorageClass;
    setShowEditMountOptions;
    setShowEditProject;
  };
}) {
  const [open, setOpen] = useState<boolean>(false);
  const { items, onClick } = useMemo(() => {
    if (!open) {
      return { onClick: () => {}, items: [] };
    }

    return {
      items: getItems(cloudFilesystem),
      onClick: async (obj) => {
        setOpen(false);
        let cmd = obj.key.startsWith("top-") ? obj.key.slice(4) : obj.key;
        switch (cmd) {
          case "mount":
            show.setShowMount(true);
            break;
          case "edit-title-and-colors":
            show.setShowEditTitleAndColor(true);
            break;
          case "edit-lock":
            show.setShowEditLock(true);
            break;
          case "edit-mountpoint":
            show.setShowEditMountpoint(true);
            break;
          case "edit-project":
            show.setShowEditProject(true);
            break;
          case "edit-mount-options":
            show.setShowEditMountOptions(true);
            break;
          case "edit-trash-config":
            show.setShowEditTrashDays(true);
            break;
          case "edit-bucket-storage-class":
            show.setShowEditBucketStorageClass(true);
            break;
          case "delete":
            show.setShowDelete(true);
            break;
          case "documentation":
          case "videos":
            // click opens new tab anyways
            break;
          case "support":
            openSupportTab({
              type: "question",
              subject: `Compute Server (Id: ${cloudFilesystem.id})`,
              body: `I am using a compute server, and have a question...`,
            });
            break;

          default:
            setError(`not implemented -- '${cmd}'`);
        }
      },
    };
  }, [cloudFilesystem, open]);

  return (
    <div style={style}>
      <Dropdown
        menu={{ items, onClick }}
        trigger={["click"]}
        disabled={cloudFilesystem.deleting}
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
    </div>
  );
}
