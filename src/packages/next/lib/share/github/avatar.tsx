import { CSSProperties } from "react";
import { Avatar } from "antd";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  name: string;
  size?: number;
  style?: CSSProperties;
}
export default function GithubAvatar({ style, size = 195 / 2, name }: Props) {
  const url = `https://avatars.githubusercontent.com/${name}`;
  return (
    <A
      href={`https://github.com/${name}`}
      style={{ textAlign: "center", ...style }}
    >
      <Avatar
        style={{ borderRadius: "7.5px", border: "1px solid #eee" }}
        shape="square"
        size={size}
        icon={<img src={url} />}
      />
      <br />
      <Icon name="external-link" /> {name}
    </A>
  );
}
