import { Avatar } from "antd";
import A from "components/misc/A";

export default function GithubAvatar({ user }) {
  const url = `https://avatars.githubusercontent.com/${user}`;
  return (
    <A href={`https://github.com/${user}`}>
      <Avatar
        style={{ borderRadius: "7.5px", border: "1px solid #eee" }}
        shape="square"
        size={195 / 2}
        icon={<img src={url} />}
      />
    </A>
  );
}
