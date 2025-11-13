/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Space } from "antd";
import useIsMounted from "lib/hooks/mounted";
import { path_split, trunc } from "@cocalc/util/misc";
import copyPublicPath from "lib/share/copy-public-path";
import Loading from "components/share/loading";
import api from "lib/api/post";
import A from "components/misc/A";
import ProjectListing from "components/project/listing";
import CreateProject from "components/project/create";
import SelectProject from "components/project/select";
import editURL from "lib/share/edit-url";
import { Icon } from "@cocalc/frontend/components/icon";
import RunApp from "components/app/path";
import useCustomize from "lib/use-customize";

interface Props {
  id;
  src_project_id;
  path;
  url;
  relativePath;
  everything;
  image;
  description;
  onCopied;
}

export default function ChooseProject(props: Props) {
  const {
    id,
    src_project_id,
    path,
    url,
    relativePath,
    everything,
    image,
    description,
    onCopied,
  } = props;
  const isMounted = useIsMounted();
  const { defaultComputeImage } = useCustomize();
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
  const [createdProject, setCreatedProject] = useState<boolean>(false);
  const targetPath = url
    ? path_split(join(path, relativePath)).tail
    : join(path, relativePath);

  useEffect(() => {
    // Always immediately start copying -- don't wait for user to click a button. See
    // https://github.com/sagemathinc/cocalc/issues/6025
    if (project != null && copying == "before") {
      doCopy();
    }
  }, [project != null]);

  async function doCopy() {
    try {
      if (project == null) throw Error("no target specified");
      setCopying("starting");
      setHideSelect(true);
      if (!createdProject) {
        // Possibly upgrade the project using a public_path license. Only do this if we
        // didn't just create the project, since in that case the license would already
        // be applied during creation.
        await api("/projects/public-path-license", {
          public_path_id: id,
          project_id: project.project_id,
        });
      }
      // Start the *target* project!
      await api("/projects/start", { project_id: project.project_id });
      if (!isMounted.current) return;
      setCopying("during");
      // Get the content
      if (url) {
        // From a URL (e.g. github)
        await api("/projects/copy-url", {
          project_id: project.project_id,
          url,
          path: targetPath,
        });
      } else {
        // From another project
        await copyPublicPath({
          id,
          src_project_id,
          path,
          url,
          relativePath: everything ? "" : relativePath, // "" = so *everything* is copied
          target_project_id: project.project_id,
        });
      }
    } catch (err) {
      if (!isMounted.current) return;
      setErrorCopying(err.message);
    } finally {
      if (!isMounted.current) return;
      setCopying("after");
      onCopied();
    }
  }

  return (
    <div>
      <div>
        {!errorCopying && copying == "after" && project?.project_id && (
          <RunApp start project_id={project.project_id} path={targetPath} />
        )}
        {image && image != defaultComputeImage && (
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
            public_path_id={id}
            defaultTitle={url ? targetPath : description}
            onCreate={(project) => {
              setCreatedProject(true);
              setProject(project);
              setHideSelect(true);
              setHideCreate(true);
            }}
          />
        )}
        {!hideSelect && (
          <SelectProject
            label="In one of your existing projects"
            onChange={({ project_id, title }) => {
              setCreatedProject(false);
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
                  <Icon name="copy" /> Copy {targetPath} to
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
                Finished copying {targetPath} to{" "}
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
                  <div>
                    <b>There appears to have been an issue copying files.</b>
                  </div>
                ) : (
                  ""
                )}
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
