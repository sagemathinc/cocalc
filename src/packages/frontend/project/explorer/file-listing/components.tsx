/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { labels } from "@cocalc/frontend/i18n";
import { NEW_FILETYPE_ICONS } from "@cocalc/frontend/project/new/consts";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

/**
 * Render a rich label for a file-type filter option:
 *   [icon] Human Name  .ext
 * Used by both the explorer table column filter and the flyout type dropdown.
 */
export function TypeFilterLabel({ ext }: { ext: string }) {
  const intl = useIntl();

  if (ext === "folder") {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        <Icon name="folder-open" style={{ width: 20, marginRight: 6 }} />
        {capitalize(intl.formatMessage(labels.folder))}
      </span>
    );
  }

  const iconOverride =
    NEW_FILETYPE_ICONS[ext as keyof typeof NEW_FILETYPE_ICONS];
  const info = file_options(`file.${ext}`);
  const iconName = iconOverride ?? info?.icon ?? "file";
  const name = info?.name;

  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <Icon name={iconName} style={{ width: 20, marginRight: 6 }} />
      {name ? `${name} ` : ""}
      <span style={{ color: COLORS.GRAY }}>.{ext}</span>
    </span>
  );
}
