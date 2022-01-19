/*
Show an avatar for a given user account.
*/

import { Avatar as AntdAvatar, Popover } from "antd";
import { CSSProperties, ReactNode } from "react";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import A from "components/misc/A";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";

interface Props {
  account_id: string;
  size?: number;
  style?: CSSProperties;
  showName?: boolean;
  extra?: ReactNode; // extra component that gets rendered below avatar when hoving, e.g., could be a "remove" action...
  zIndex?: number;
}

export default function Avatar({
  account_id,
  size,
  style,
  showName,
  extra,
  zIndex,
}: Props) {
  const { account } = useCustomize();
  if (size == null) {
    // Default size=40 to match the cocalc logo.
    size = 40;
  }
  const profile = useProfile({ account_id });

  if (!profile) {
    // not loaded yet
    return <DisplayAvatar style={style} size={size} />;
  }

  return (
    <Popover
      mouseLeaveDelay={0.3}
      zIndex={zIndex}
      title={
        <div style={{ textAlign: "center", fontSize: "13pt" }}>
          {profile.first_name} {profile.last_name}{" "}
          {profile.name ? `(@${profile.name})` : ""}
          {account_id == account?.account_id && (
            <A
              href="/config/account/name"
              style={{
                fontSize: "11px",
                marginLeft: "10px",
                float: "right",
              }}
            >
              edit
            </A>
          )}
        </div>
      }
      content={
        <div style={{ textAlign: "center" }}>
          {profile.image ? (
            <DisplayAvatar
              style={style}
              size={size * 4}
              image={profile.image}
            />
          ) : (
            <DisplayAvatar
              style={style}
              size={size * 4}
              color={profile.color}
              letter={profile.first_name?.[0]}
            />
          )}
          {account_id == account?.account_id && (
            <div style={{ marginTop: "10px" }}>
              <A
                href="/config/account/avatar"
                style={{
                  fontSize: "11px",
                }}
              >
                edit
              </A>
            </div>
          )}
          {extra}
        </div>
      }
    >
      <span style={{ cursor: "pointer" }}>
        {profile.image ? (
          <DisplayAvatar style={style} size={size} image={profile.image} />
        ) : (
          <DisplayAvatar
            style={style}
            size={size}
            color={profile.color}
            letter={profile.first_name?.[0]}
          />
        )}
        {showName && (
          <>
            <br />
            {profile.first_name} {profile.last_name}
          </>
        )}
      </span>
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
