/*
When you want to edit an existing public share, here's the flow of what happens.

- If you are a collaborator on the project with the shared document it shows a button to "Open the file in my project" (or something).
- If you are NOT a collaborator on the project there are various states:
  - If you are NOT signed in it gives you the option to:
    - Sign in, then start this flowchart over
    - Sign up, then start this over
    - Create a new anonymous project and anonymously edit this content.
  - If you are signed in, it gives you these options:
    - Create a new project and copy this content to that project (and it opens the project in a new tab).
    - Copy this content to one of your existing projects.
      - If you select this, then a select an existing projects, and maybe a directory in that project.
      - Project starts and content gets copied
      - Maybe when done get a link and can open that.
- In all cases above, if share comes with a license (i.e., the CUP situation), then that license gets applied to the relevant project... temporarily (?).

*/

import { join } from "path";
import { useState } from "react";
import { Alert, Button, Card, Checkbox, Divider, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import editURL from "lib/share/edit-url";
import shareURL from "lib/share/share-url";
import SignInAuth from "components/auth/sign-in";
import SignUpAuth from "components/auth/sign-up";
import Anonymous from "components/auth/try";
import { useRouter } from "next/router";
import SelectProject from "components/project/select";
import CreateProject from "components/project/create";
import ProjectListing from "components/project/listing";
import api from "lib/api/post";
import Loading from "components/share/loading";
import useIsMounted from "lib/hooks/mounted";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { trunc } from "@cocalc/util/misc";
import ConfigurePublicPath from "components/share/configure-public-path";
import copyPublicPath from "lib/share/copy-public-path";

interface Props {
  id: string;
  path: string;
  relativePath: string;
  project_id: string;
  image?: string;
  description?: string;
}

export default function Edit({
  id,
  path,
  relativePath,
  project_id,
  image,
  description,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<boolean>(!!router.query.edit);

  return (
    <span>
      <Button
        disabled={expanded}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(true);
        }}
        key="edit"
        size="small"
      >
        <Icon name="pencil" /> Edit...
      </Button>
      {expanded && (
        <EditOptions
          id={id}
          path={path}
          relativePath={relativePath}
          project_id={project_id}
          image={image}
          description={description}
          onClose={() => setExpanded(false)}
        />
      )}
    </span>
  );
}

interface EditProps extends Props {
  onClose: () => void;
}

function EditOptions({
  id,
  path,
  relativePath,
  project_id,
  image,
  onClose,
  description,
}: EditProps) {
  const { account } = useCustomize();
  return (
    <Card
      style={{ margin: "30px 0" }}
      title={
        <>
          <div style={{ float: "right", cursor: "pointer" }} onClick={onClose}>
            <Icon name="times-circle" />
          </div>
          <Icon style={{ marginRight: "10px" }} name="pencil" /> Where to edit{" "}
          <b>{join(path, relativePath)}</b>?
        </>
      }
    >
      {account?.account_id != null && (
        <SignedInOptions
          id={id}
          path={path}
          relativePath={relativePath}
          project_id={project_id}
          image={image}
          description={description}
        />
      )}
      {account?.account_id == null && <NotSignedInOptions />}
      <br />
    </Card>
  );
}

function SignedInOptions({
  id,
  path,
  relativePath,
  project_id,
  image,
  description,
}) {
  const { isCollaborator } = useCustomize();
  return isCollaborator ? (
    <OpenDirectly
      id={id}
      project_id={project_id}
      path={path}
      relativePath={relativePath}
    />
  ) : (
    <ChooseProject
      id={id}
      src_project_id={project_id}
      path={path}
      relativePath={relativePath}
      image={image}
      description={description ? description : path ? path : relativePath}
    />
  );
}

function OpenDirectly({
  project_id,
  path,
  id,
  relativePath,
}: {
  id: string;
  project_id: string;
  path: string;
  relativePath: string;
}) {
  const url = editURL({
    type: "collaborator",
    project_id,
    path,
    relativePath,
  });
  return (
    <div>
      You are signed in as a collaborator on{" "}
      <A href={editURL({ type: "collaborator", project_id })} external>
        the project
      </A>{" "}
      that contains{" "}
      <A href={url} external>
        this shared document,
      </A>{" "}
      so you can easily{" "}
      <A href={url} external>
        open it directly.
      </A>
      <br />
      {!relativePath ? (
        <>
          <br />
          You can adjust how this is shared below, or turn off sharing by
          checking "Disabled".
          <ConfigurePublicPath id={id} project_id={project_id} path={path} />
        </>
      ) : (
        <>
          <br />
          Go to the{" "}
          <A href={shareURL(id)}>containing directory that was shared</A> to
          configure how this is shared or unshare it.
        </>
      )}
    </div>
  );
}

function ChooseProject({
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
                  <Icon name="paper-plane" /> Open {join(path, relativePath)}
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

function NotSignedInOptions() {
  const { anonymousSignup } = useCustomize();
  return (
    <div>
      <SignIn />
      {anonymousSignup && <OpenAnonymously />}
    </div>
  );
}

// TODO: below we need to get the strategies!
// and also requiresToken for SignUp!

function SignIn() {
  const router = useRouter();
  const [show, setShow] = useState<"sign-in" | "sign-up" | "">("");
  return (
    <div style={{ textAlign: "center" }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> Choose Project
      </Divider>
      <a onClick={() => setShow("sign-in")}>Sign In</a> or{" "}
      <a onClick={() => setShow("sign-up")}>Sign Up</a> to edit in one of your
      projects.
      <br />
      <br />
      {show == "sign-in" && (
        <SignInAuth
          strategies={[]}
          minimal
          onSuccess={() =>
            router.push({
              pathname: router.asPath.split("?")[0],
              query: { edit: "true" },
            })
          }
        />
      )}
      {show == "sign-up" && (
        <SignUpAuth
          strategies={[]}
          minimal
          onSuccess={() =>
            router.push({
              pathname: router.asPath.split("?")[0],
              query: { edit: "true" },
            })
          }
        />
      )}
    </div>
  );
}

function OpenAnonymously() {
  const router = useRouter();
  return (
    <div>
      <Divider>
        <Icon name="mask" style={{ marginRight: "10px" }} /> Anonymously
      </Divider>
      <Anonymous
        minimal
        onSuccess={() =>
          router.push({
            pathname: router.asPath.split("?")[0],
            query: { edit: "true" },
          })
        }
      />
    </div>
  );
}

