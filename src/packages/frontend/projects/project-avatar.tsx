/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render a single project entry, which goes in the list of projects
*/

import { Avatar } from "antd";
import { CSSProperties, useEffect } from "react";

import {
  React,
  redux,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";

interface ProjectAvatarImageProps {
  project_id: string;
  size?: number;
  onClick?: Function;
  style?: CSSProperties;
  askToAddAvatar?: boolean;
}

export function ProjectAvatarImage(props: ProjectAvatarImageProps) {
  const { project_id, size, onClick, style, askToAddAvatar = false } = props;
  const isMounted = useIsMountedRef();
  const [avatarImage, setAvatarImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const img = await redux
        .getStore("projects")
        .getProjectAvatarImage(project_id);
      if (!isMounted.current) return;
      setAvatarImage(img);
    })();
  }, []);

  function renderAdd(): React.JSX.Element {
    if (!askToAddAvatar || onClick == null) return <></>;
    return (
      <Paragraph type="secondary" style={style} onClick={(e) => onClick(e)}>
        (Click to add avatar image)
      </Paragraph>
    );
  }

  return avatarImage ? (
    <div style={style} onClick={(e) => onClick?.(e)}>
      <Avatar
        shape="square"
        size={size ?? 160}
        src={avatarImage}
        alt="Project avatar"
      />
    </div>
  ) : (
    renderAdd()
  );
}
