/*
Show an avatar for a given user account.
*/

import { Avatar as AntdAvatar } from "antd";
import { CSSProperties } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import useProfile from "lib/hooks/profile";

interface Props {
  account_id: string;
  size?: number;
  style?: CSSProperties;
}

export default function Avatar({ account_id, size, style }: Props) {
  if (size == null) {
    // Default size=40 to match the cocalc logo.
    size = 40;
  }
  const profile = useProfile(account_id);

  if (!profile) {
    // not loaded yet
    return (
      <AntdAvatar
        style={{
          verticalAlign: "middle",
          ...style,
        }}
        size={size}
      ></AntdAvatar>
    );
  }

  if (profile.image) {
    return (
      <AntdAvatar
        style={{
          verticalAlign: "middle",
          ...style,
        }}
        size={size}
        src={<img src={profile.image} />}
      />
    );
  }

  let fontSize: string | undefined = undefined;
  if (size != null) {
    if (size >= 32) {
      fontSize = `${0.75 * size}px`;
    } else if (size >= 24) {
      fontSize = "16pt";
    }
  }

  return (
    <AntdAvatar
      style={{
        backgroundColor: profile.color,
        verticalAlign: "middle",
        fontSize,
        color: avatar_fontcolor(profile.color),
        ...style,
      }}
      size={size}
    >
      {profile.first_name?.[0]}
    </AntdAvatar>
  );
}
