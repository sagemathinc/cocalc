/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { useState } from "react";
import { Alert, Button, Checkbox, Space } from "antd";
import useIsMounted from "lib/hooks/mounted";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { trunc } from "@cocalc/util/misc";
import copyPublicPath from "lib/share/copy-public-path";
import Loading from "components/share/loading";
import api from "lib/api/post";
import A from "components/misc/A";
import ProjectListing from "components/project/listing";
import CreateProject from "components/project/create";
import SelectProject from "components/project/select";
import editURL from "lib/share/edit-url";
import { Icon } from "@cocalc/frontend/components/icon";

export default function ChooseProject({
  id,
  src_project_id,
  path,
  relativePath,
  image,
  description,
}) {
  const isMounted = useIsMounted();
  const [project, setProject] = useState<
    { project_id: string; title: string } | undefined
  >(undefined);
  const [copying, setCopying] = useState<
    "before" | "starting" | "during" | "after"
  >("before");
  const [errorCopying, setErrorCopying] = useState<string>("");
  const [showListing, setShowListing] = useState<boolean>(false);
  const [hideSelect, setHideSelect] = useState<boolean>(false);
  const [hideCreate, setHideCreate] = useState<boolean>(false);
  const targetPath = join(path, relativePath);

  async function doCopy() {
    try {
      if (project == null) throw Error("no target specified");
      // Possibly upgrade the project using a public_path license
      await api("/projects/public-path-license", {
        public_path_id: id,
        project_id: project.project_id,
      });
      // Start the *target* project!
      setCopying("starting");
      await api("/projects/start", { project_id: project.project_id });
      if (!isMounted.current) return;
      setCopying("during");
      await copyPublicPath({
        id,
        src_project_id,
        path,
        relativePath,
        target_project_id: project.project_id,
      });
    } catch (err) {
      if (!isMounted.current) return;
      setErrorCopying(err.message);
    } finally {
      if (!isMounted.current) return;
      setCopying("after");
    }
  }

  return (
    <div>
      <div>
        {image && image != DEFAULT_COMPUTE_IMAGE && (
          <div>
            We recommend that you create a new project, since this public path
            uses the non-default image "{image}".
          </div>
        )}
        {!hideCreate && (
          <CreateProject
            image={image}
            label="In a new project"
            start={true}
            defaultTitle={description}
            onCreate={(project) => {
              setProject(project);
              setHideSelect(true);
            }}
          />
        )}
        {!hideSelect && (
          <SelectProject
            label="In one of your existing projects"
            onChange={({ project_id, title }) => {
              setProject({ project_id, title });
              setHideCreate(true);
            }}
          />
        )}
      </div>{" "}
      {project && (
        <Space
          direction="vertical"
          style={{ width: "100%", marginTop: "15px" }}
        >
          <div style={{ textAlign: "center" }}>
            {copying == "before" && (
              <>
                <Button
                  onClick={doCopy}
                  size="large"
                  type="primary"
                  style={{ maxWidth: "100%", overflow: "hidden" }}
                  shape="round"
                >
                  <Icon name="copy" /> Copy {join(path, relativePath)} to
                  <b style={{ marginLeft: "5px" }}>{project.title}</b>
                </Button>
                {!hideSelect && (
                  <Checkbox
                    disabled={!project}
                    style={{
                      float: "right",
                      marginTop: "15px",
                      fontSize: "10pt",
                      color: "#666",
                    }}
                    onChange={(e) => setShowListing(e.target.checked)}
                  >
                    Show contents of{" "}
                    <A
                      href={editURL({
                        type: "collaborator",
                        project_id: project.project_id,
                      })}
                      external
                    >
                      {trunc(project.title, 30)}
                    </A>
                  </Checkbox>
                )}
              </>
            )}
            {copying == "starting" && (
              <>
                <Loading style={{ fontSize: "24px" }}>
                  Starting {project.title}...
                </Loading>
              </>
            )}
            {copying == "during" && (
              <>
                <Loading style={{ fontSize: "24px" }}>
                  Copying files to {project.title}...
                </Loading>
              </>
            )}
            {copying == "after" && (
              <>
                <Icon
                  name={errorCopying ? "times-circle" : "check"}
                  style={{ color: "darkgreen", fontSize: "16pt" }}
                />{" "}
                Finished copying {join(path, relativePath)} to{" "}
                <A
                  href={editURL({
                    type: "collaborator",
                    project_id: project.project_id,
                    path: targetPath,
                  })}
                  external
                >
                  {targetPath}
                </A>{" "}
                in your project{" "}
                <A
                  href={editURL({
                    type: "collaborator",
                    project_id: project.project_id,
                  })}
                  external
                >
                  {project.title}
                </A>
                .{" "}
                {errorCopying ? (
                  <div>There might have been an issue copying files.</div>
                ) : (
                  ""
                )}
                <br />
                <Button
                  href={editURL({
                    type: "collaborator",
                    project_id: project.project_id,
                    path: targetPath,
                  })}
                  target="_blank"
                  size="large"
                  type="primary"
                  style={{
                    maxWidth: "100%",
                    overflow: "hidden",
                    margin: "15px 0",
                  }}
                  shape="round"
                >
                  <Icon name="paper-plane" /> Open your copy of "
                  {join(path, relativePath)}"...
                </Button>
              </>
            )}
          </div>
          {errorCopying && (
            <Alert type="warning" message={errorCopying} showIcon />
          )}
          {showListing && (
            <div style={{ marginTop: "10px" }}>
              <ProjectListing
                project_id={project.project_id}
                title={project.title}
                path=""
                update={copying}
                sort="time"
              />
            </div>
          )}
        </Space>
      )}
    </div>
  );
}
