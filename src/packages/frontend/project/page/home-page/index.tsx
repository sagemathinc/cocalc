import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import {
  useActions,
  useEffect,
  useRedux,
  redux,
} from "@cocalc/frontend/app-framework";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { ProjectLog } from "@cocalc/frontend/project/history";
import { useState } from "react";
import ProjectImage from "@cocalc/frontend/project/settings/image";
import { Alert } from "antd";

/*
import { Explorer } from "@cocalc/frontend/project/explorer";
import { ProjectNew } from "@cocalc/frontend/project/new";
import { ProjectInfo } from "@cocalc/frontend/project/info";
      <Block>
        <Explorer project_id={project_id} />
      </Block>
      <Block>
        <ProjectNew project_id={project_id} />
      </Block>
      <Block>
        <ProjectInfo project_id={project_id} />
      </Block>
      */

function Block({ children, onClick, style }: { children; onClick?; style? }) {
  return (
    <div
      onClick={onClick}
      className="smc-vfill"
      style={{
        maxWidth: "800px",
        height: "500px",
        border: "1px solid #ddd",
        overflowY: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function HomePage({ project_id }) {
  const desc = useRedux(["projects", "project_map", project_id, "description"]);
  const actions = useActions({ project_id });
  const [error, setError] = useState<string>("");
  const [avatarImage, setAvatarImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    (async () => {
      setAvatarImage(
        await redux.getStore("projects").getProjectAvatarImage(project_id)
      );
    })();
  }, []);

  return (
    <div style={{ margin: "15px" }}>
      <div
        style={{
          overflow: "auto",
          display: "flex",
        }}
      >
        <div style={{ flex: 1, textAlign: "center", padding: "0 30px" }}>
          <h1
            onClick={() => actions?.set_active_tab("settings")}
            style={{ cursor: "pointer" }}
          >
            <ProjectTitle project_id={project_id} noClick />
          </h1>
          {error && (
            <Alert
              style={{ marginTop: "15px" }}
              type="error"
              message={error}
              showIcon
            />
          )}
          <ProjectImage
            avatarImage={avatarImage}
            onChange={async (data) => {
              try {
                await redux
                  .getActions("projects")
                  .setProjectImage(project_id, data);
                setAvatarImage(data.full);
              } catch (err) {
                setError(`Error saving project image: ${err}`);
              }
            }}
          />
        </div>
        <div
          style={{
            flex: 1,
            cursor: "pointer",
            maxHeight: "300px",
            overflow: "auto",
            margin: "0 30px",
          }}
          onClick={() => actions?.set_active_tab("settings")}
        >
          <StaticMarkdown value={desc} />
        </div>
      </div>
      <br />
      <Block style={{ margin: "auto" }}>
        <ProjectLog project_id={project_id} />
      </Block>
    </div>
  );
}
