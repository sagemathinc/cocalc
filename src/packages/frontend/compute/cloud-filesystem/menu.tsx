/*
Cloud file system menu.
*/

import { Button, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { A, Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import openSupportTab from "@cocalc/frontend/support/open";
import { User } from "@cocalc/frontend/users";

function getItems(cloudFilesystem, show): MenuProps["items"] {
  const help = {
    key: "help",
    icon: <Icon name="question-circle" />,
    label: "Help",
    children: [
      {
        key: "help-ops",
        icon: <Icon name="question-circle" />,
        label: "Filesystem Commands",
      },
      {
        key: "documentation",
        icon: <Icon name="question-circle" />,
        label: (
          <A href="https://doc.cocalc.com/compute_server.html">
            Compute Server Documentation
          </A>
        ),
      },
      {
        key: "support",
        icon: <Icon name="medkit" />,
        label: "CoCalc Support",
      },
      {
        key: "videos",
        icon: <Icon name="youtube" style={{ color: "red" }} />,
        label: (
          <A href="https://www.youtube.com/playlist?list=PLOEk1mo1p5tJmEuAlou4JIWZFH7IVE2PZ">
            Compute Server Videos
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
      label: cloudFilesystem.mount ? "Disable Automount" : "Enable Automount",
    },
    {
      key: "metrics",
      icon: <Icon name={"graph"} />,
      label: `${show.showMetrics ? "Hide" : "Show"} Metrics`,
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
    // I think this leads to problems and corruption, and is also just really confusing to use.
    // cocalc has timetravel, etc., and we should make a proper periodic backup-to-another-bucket
    // functionality.
    //     {
    //       key: "edit-trash-config",
    //       icon: <Icon name={"trash"} />,
    //       label: cloudFilesystem.trash_days ? "Configure Trash" : "Enable Trash",
    //     },
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
      label: "Change Mountpoint",
    },
    {
      key: "edit-project",
      disabled: cloudFilesystem.mount,
      icon: <Icon name={"pencil"} />,
      label: "Move to Another Workspace",
    },
    {
      type: "divider",
    },
    {
      key: "edit-mount-options",
      icon: <Icon name={"database"} />,
      label: "Mount and KeyDB Options",
    },
    {
      disabled: cloudFilesystem.mount,
      danger: true,
      key: "delete",
      icon: <Icon name="trash" />,
      label: "Delete Filesystem",
    },
    {
      type: "divider",
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
  show?: {
    setShowHelp;
    setShowMount;
    setShowEditMountpoint;
    setShowEditTitleAndColor;
    setShowDelete;
    setShowEditLock;
    setShowEditTrashDays;
    setShowEditBucketStorageClass;
    setShowEditMountOptions;
    setShowEditProject;
    setShowMetrics;
    showMetrics;
  };
}) {
  const [open, setOpen] = useState<boolean>(false);
  const { items, onClick } = useMemo(() => {
    if (!open) {
      return { onClick: () => {}, items: [] };
    }

    return {
      items: show != null ? getItems(cloudFilesystem, show) : [],
      onClick: async (obj) => {
        if (show == null) {
          return;
        }
        setOpen(false);
        let cmd = obj.key.startsWith("top-") ? obj.key.slice(4) : obj.key;
        switch (cmd) {
          case "mount":
            show.setShowMount(true);
            break;
          case "metrics":
            show.setShowMetrics(!show.showMetrics);
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
          case "help-ops":
            show.setShowHelp(true);
            break;
          case "documentation":
          case "videos":
            // click opens new tab anyways
            break;
          case "support":
            openSupportTab({
              type: "question",
              subject: `Cloud File System (Global Id: ${cloudFilesystem.id}; Workspace Specific Id: ${cloudFilesystem.project_specific_id})`,
              body: `I am using a cloud file system, and have a question...`,
            });
            break;

          default:
            setError(`not implemented -- '${cmd}'`);
        }
      },
    };
  }, [cloudFilesystem, open]);

  if (show == null) {
    return (
      <div>
        Owner: <User account_id={cloudFilesystem.account_id} />
      </div>
    );
  }

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
