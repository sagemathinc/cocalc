import { Button, Popover } from "antd";
import { CSSProperties, useState } from "react";
import basePath from "lib/base-path";
import { Icon } from "@cocalc/frontend/components/icon";
import editURL from "lib/share/edit-url";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import { join } from "path";
import { trunc_middle } from "@cocalc/util/misc";

interface Props {
  project_id: string;
  path: string;
  width?: string;
  height?: string;
  style?: CSSProperties;
  fullscreen?: boolean;
}
export default function Embed({
  project_id,
  path,
  style,
  fullscreen: fullscreen0,
}: Props) {
  const [fullscreen, setFullscreen] = useState<boolean>(!!fullscreen0);

  const src = join(
    basePath,
    `static/embed.html?target=projects/${project_id}/files/${path}`
  );
  return (
    <div
      style={
        fullscreen
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 1000,
              background: "white",
            }
          : {
              padding: "5px 15px",
              height: "70vh",
              border: "1px solid #ddd",
              borderRadius: "5px",
              boxShadow: "5px 5px 5px #eee",
              display: "flex",
              flexDirection: "column",
              ...style,
            }
      }
    >
      <div>
        <div style={{ display: "flex" }}>
          <div
            style={{
              flex: 1,
              paddingTop: "2.5px",
              paddingLeft: fullscreen ? "15px" : undefined,
            }}
          >
            <Popover
              title="Open in the App"
              content={
                <div style={{maxWidth:'350px'}}>
                  Open {path} in the <SiteName /> app for more options and to
                  see your other files...
                </div>
              }
            >
              <Icon name="external-link" style={{ marginRight: "5px" }} />
              <A
                href={editURL({ type: "collaborator", project_id, path })}
                external
              >
                {trunc_middle(path, 50)}
              </A>
            </Popover>
          </div>
          <Button
            size="small"
            type="text"
            onClick={() => {
              if (!fullscreen) {
                document.documentElement.requestFullscreen();
              } else {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                }
              }
              setFullscreen(!fullscreen);
            }}
          >
            <Icon name={fullscreen ? "compress" : "expand"} />
          </Button>
        </div>
      </div>
      <hr style={{ width: "100%" }} />
      <iframe src={src} width={"100%"} height={"100%"} frameBorder="0" />
    </div>
  );
}
