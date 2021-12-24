/*
Show an avatar for a given user account.
*/

import { Avatar as AntdAvatar, Popover } from "antd";
import { CSSProperties } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import useProfile from "lib/hooks/profile";

interface Props {
  account_id: string;
  size?: number;
  style?: CSSProperties;
  showName?: boolean;
}

export default function Avatar({ account_id, size, style, showName }: Props) {
  if (size == null) {
    // Default size=40 to match the cocalc logo.
    size = 40;
  }
  const profile = useProfile({ account_id });

  if (!profile) {
    // not loaded yet
    return <DisplayAvatar style={style} size={size} />;
  }

  if (profile.image) {
    return <DisplayAvatar style={style} size={size} image={profile.image} />;
  }

  return (
    <Popover
      title={`${profile.first_name} ${profile.last_name}`}
      content={
        <div style={{ textAlign: "center" }}>
          <DisplayAvatar
            style={style}
            size={size * 2}
            color={profile.color}
            letter={profile.first_name?.[0]}
          />
        </div>
      }
    >
      <DisplayAvatar
        style={style}
        size={size}
        color={profile.color}
        letter={profile.first_name?.[0]}
      />
      {showName && (
        <>
          <br />
          {profile.first_name} {profile.last_name}
        </>
      )}
    </Popover>
  );
}

interface DisplayProps extends Partial<Props> {
  image?: string;
  color?: string;
  letter?: string;
}

export function DisplayAvatar({
  style,
  size,
  image,
  color,
  letter,
}: DisplayProps) {
  if (!image && !color && !letter) {
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

  if (image) {
    return (
      <AntdAvatar
        style={{
          verticalAlign: "middle",
          ...style,
        }}
        size={size}
        src={<img src={image} />}
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
        backgroundColor: color,
        verticalAlign: "middle",
        fontSize,
        color: avatar_fontcolor(color),
        ...style,
      }}
      size={size}
    >
      {letter ? letter : "?"}
    </AntdAvatar>
  );
}
