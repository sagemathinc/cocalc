import { CSSProperties } from "react";
import { Avatar, Tooltip } from "antd";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { trunc } from "@cocalc/util/misc";

interface Props {
  name: string;
  repo?: string; // if given, impacts links
  size?: number;
  style?: CSSProperties;
}
export default function GithubAvatar({ style, size = 195 / 2, name }: Props) {
  const url = `https://github.com/${name}`;
  return (
    <Tooltip
      title={`Open the GitHub pag ${url} in a new tab.`}
      placement="left"
    >
      <A href={url} style={{ textAlign: "center", ...style }}>
        <Avatar
          style={{ borderRadius: "7.5px", border: "1px solid #eee" }}
          shape="square"
          size={size}
          icon={<img src={`https://avatars.githubusercontent.com/${name}`} />}
        />
        <br />
        <Icon name="external-link" /> {trunc(name, 28)}{" "}
        <Icon name="github" />
      </A>
    </Tooltip>
  );
}
