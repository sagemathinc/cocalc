import { CSSProperties } from "react";
import basePath from "lib/base-path";
import { Icon } from "@cocalc/frontend/components/icon";
import editURL from "lib/share/edit-url";
import A from "components/misc/A";
import SiteName from "components/share/site-name";

interface Props {
  project_id: string;
  path: string;
  width?: string;
  height?: string;
  style?: CSSProperties;
}
export default function Embed({ project_id, path, style }: Props) {
  const src = `${basePath}/projects/${project_id}/files/${path}?fullscreen=kiosk`;
  return (
    <div
      style={{
        padding: "5px",
        height: "80vh",
        border: "1px solid #ddd",
        borderRadius: "5px",
        boxShadow: "5px 5px 5px #eee",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <iframe src={src} width={"100%"} height={"100%"} frameBorder="0" />
      <hr style={{ width: "100%" }} />
      <div>
        <Icon name="external-link" style={{ marginRight: "5px" }} />
        <A href={editURL({ type: "collaborator", project_id, path })} external>
          Open {path} in <SiteName /> for more options
        </A>
      </div>
    </div>
  );
}
