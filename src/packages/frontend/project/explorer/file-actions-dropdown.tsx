import { useMemo } from "react";
import { useIntl } from "react-intl";
import { DropdownMenu, Icon, type MenuItems } from "@cocalc/frontend/components";
import { file_actions, type ProjectActions } from "@cocalc/frontend/project_store";
import type { FileAction } from "@cocalc/frontend/project_actions";
import { isDisabledSnapshots, isSnapshotPath } from "./action-utils";

interface Props {
  names: readonly FileAction[];
  current_path?: string;
  actions?: ProjectActions;
  label?: string;
  size?: "small" | "middle" | "large";
  iconOnly?: boolean;
  showDown?: boolean;
  hideFlyout?: boolean;
  activateFilesTab?: boolean;
}

export function FileActionsDropdown({
  names,
  current_path,
  actions,
  label = "Actions",
  size,
  iconOnly,
  showDown = true,
  hideFlyout,
  activateFilesTab,
}: Props) {
  const intl = useIntl();
  if (!actions) return null;
  const items = useMemo<MenuItems>(() => {
    return names.flatMap((name) => {
      if (isSnapshotPath(current_path) && isDisabledSnapshots(name)) {
        return [];
      }
      const obj = file_actions[name];
      if (!obj) return [];
      if (hideFlyout && obj.hideFlyout) return [];
      return [
        {
          key: name,
          label: (
            <span style={{ whiteSpace: "nowrap" }}>
              <Icon name={obj.icon} style={{ marginRight: 6 }} />
              {intl.formatMessage(obj.name)}
            </span>
          ),
          onClick: () => {
            if (activateFilesTab) {
              actions.set_active_tab("files");
            }
            actions.set_file_action(name);
          },
        },
      ];
    });
  }, [actions, activateFilesTab, current_path, hideFlyout, intl, names]);

  if (!items.length) return null;

  const title = iconOnly ? (
    <Icon name="ellipsis" />
  ) : (
    <span style={{ whiteSpace: "nowrap" }}>
      <Icon name="ellipsis" /> {label}
    </span>
  );

  return (
    <DropdownMenu
      button
      showDown={showDown && !iconOnly}
      size={size}
      items={items}
      title={title}
    />
  );
}
