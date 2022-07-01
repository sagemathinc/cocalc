import { CSSProperties } from "react";
import { Avatar } from "antd";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  name: string;
  repo?: string; // if given, impacts links
  size?: number;
  style?: CSSProperties;
}
export default function GithubAvatar({
  style,
  size = 195 / 2,
  name,
  repo,
}: Props) {
  const target = `${name}${repo ? "/" + repo : ""}`;
  const url = `https://github.com/${target}`;
  return (
    <A href={url} style={{ textAlign: "center", ...style }}>
      <Avatar
        style={{ borderRadius: "7.5px", border: "1px solid #eee" }}
        shape="square"
        size={size}
        icon={<img src={`https://avatars.githubusercontent.com/${name}`} />}
      />
      <br />
      <Icon name="github" /> {target}
    </A>
  );
}
