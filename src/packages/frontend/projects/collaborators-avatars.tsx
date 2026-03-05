/*
 *  This file is part of CoCalc: Copyright © 2025-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * CollaboratorsAvatars - Displays overlapping avatars of project collaborators
 *
 * Shows up to 5 avatars in an overlapping style with a tooltip listing
 * up to 20 collaborator names.
 */

import { Tooltip } from "antd";
import { useMemo } from "react";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { DEFAULT_COLOR } from "../users/store";

const AVATARS_CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
} as const;

const AVATAR_WRAPPER_STYLE: CSS = {
  display: "inline-block",
  marginLeft: "-10px",
  border: "2px solid white",
  borderRadius: "50%",
  lineHeight: 0,
} as const;

const FIRST_AVATAR_STYLE: CSS = {
  ...AVATAR_WRAPPER_STYLE,
  marginLeft: 0,
} as const;

interface Props {
  collaboratorIds: string[]; // Already filtered to exclude current user
  size?: number;
  maxAvatars?: number;
  maxNamesTooltip?: number;
}

export function CollaboratorsAvatars({
  collaboratorIds,
  size = 24,
  maxAvatars = 5,
  maxNamesTooltip = 20,
}: Props) {
  const user_map = useTypedRedux("users", "user_map");

  // Slice to max avatars to display
  const displayIds = collaboratorIds.slice(0, maxAvatars);

  // Get remaining collaborator names for +N tooltip
  const remainingNames = useMemo(() => {
    if (!user_map || collaboratorIds.length <= maxAvatars) return [];

    const remainingIds = collaboratorIds.slice(
      maxAvatars,
      maxAvatars + maxNamesTooltip,
    );

    return remainingIds.map((account_id) => {
      const user = user_map.get(account_id);
      if (!user) return "Unknown";

      const first_name = user.get("first_name") || "";
      const last_name = user.get("last_name") || "";
      const name = `${first_name} ${last_name}`.trim();

      return name || user.get("email_address") || "Unknown";
    });
  }, [collaboratorIds, user_map, maxAvatars, maxNamesTooltip]);

  if (displayIds.length === 0) {
    return null;
  }

  // Build tooltip content for +N indicator
  const remainingTooltip =
    remainingNames.length > 0 ? (
      <div>
        {remainingNames.map((name, idx) => (
          <div key={idx}>{name}</div>
        ))}
        {collaboratorIds.length > maxAvatars + maxNamesTooltip && (
          <div>
            <i>
              ...and {collaboratorIds.length - maxAvatars - maxNamesTooltip}{" "}
              more
            </i>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div style={AVATARS_CONTAINER_STYLE}>
      {displayIds.map((account_id, idx) => (
        <div
          key={account_id}
          style={idx === 0 ? FIRST_AVATAR_STYLE : AVATAR_WRAPPER_STYLE}
        >
          <Avatar account_id={account_id} size={size} />
        </div>
      ))}
      {collaboratorIds.length > maxAvatars && (
        <Tooltip title={remainingTooltip} placement="top">
          <div
            style={{
              ...AVATAR_WRAPPER_STYLE,
              width: size + 4,
              height: size + 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: DEFAULT_COLOR,
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            +{collaboratorIds.length - maxAvatars}
          </div>
        </Tooltip>
      )}
    </div>
  );
}
