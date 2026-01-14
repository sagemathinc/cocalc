import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  DEFAULT_PROJECT_IMAGE,
  PROJECT_IMAGE_PATH,
} from "@cocalc/util/db-schema/defaults";
import { Button, Input, Modal, Spin, Tag } from "antd";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import ShowError from "@cocalc/frontend/components/error";
import { redux } from "@cocalc/frontend/app-framework";
import { dirname, join } from "path";
import { A, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { split } from "@cocalc/util/misc";

export default function RootFilesystemImage() {
  const { project } = useProjectContext();
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const [open, setOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [value, setValue] = useState<string>(getImage(project));
  const [error, setError] = useState<string>("");
  const [images, setImages] = useState<string[]>([DEFAULT_PROJECT_IMAGE]);
  const [help, setHelp] = useState<boolean>(false);

  useEffect(() => {
    setValue(getImage(project));
  }, [project]);

  useEffect(() => {
    if (project == null) return;
    (async () => {
      try {
        setImages(await getImages(project.get("project_id")));
      } catch {}
    })();
  }, [project?.get("project_id")]);

  if (project == null) {
    return null;
  }

  return (
    <div style={{ marginTop: "-4px", marginLeft: "-10px" }}>
      <Button
        type={"link"}
        disabled={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <code>{value}</code>
      </Button>
      {open && (
        <Modal
          width={700}
          open
          onCancel={() => {
            setValue(getImage(project));
            setOpen(false);
          }}
          title={
            <>
              <Icon name="docker" style={{ marginRight: "15px" }} />
              Root Filesystem Image{" "}
              {saving && (
                <>
                  Saving...
                  <Spin />
                </>
              )}
              <Button
                size="small"
                onClick={() => setHelp(!help)}
                style={{ marginLeft: "30px" }}
              >
                Help
              </Button>
            </>
          }
          onOk={async () => {
            try {
              setSaving(true);
              const project_id = project.get("project_id");
              const v = split(
                value?.trim() ? value.trim() : DEFAULT_PROJECT_IMAGE,
              );
              // just take last part, so if they type "docker pull imagename" it still works.
              let image = v.slice(-1)[0];
              await setRootFilesystemImage({
                project_id,
                image,
              });
              if (project.getIn(["state", "state"]) == "running") {
                redux.getActions("projects").restart_project(project_id);
              }
            } catch (err) {
              setError(err);
              return;
            } finally {
              setSaving(false);
            }
            setOpen(false);
          }}
        >
          {help && (
            <div style={{ color: "#666", marginBottom: "8px" }}>
              <p>
                You can try to run your {projectLabelLower} using{" "}
                <A href="https://hub.docker.com/search">any container image</A>.
                You can change the image at any time.
              </p>
              <p>
                If you install software or otherwise modify files in the root
                filesystem, then those changes <b>are saved</b>. If you change
                the root image namebelow, the changes you made to the previous
                root filesystem are no longer <b>visible</b>. You will see the
                changes if you change the image back. The changes are stored in{" "}
                <code>$HOME/{PROJECT_IMAGE_PATH}</code>. It's best to specify an
                explicit tag for your image, so that your changes don't become
                invalid.
              </p>
              <p>
                Using a large image can make {projectLabelLower} startup slower,
                especially the first time. Also, images can contain literally
                anything, so there is no guarantee they will work. If you try
                one and it doesn't work for you, just switch back -- it's safe.
                Selecting an image determines the root filesystem and also
                impacts environment variables. For example,{" "}
                <A href="https://hub.docker.com/_/julia">
                  the official Julia image
                </A>{" "}
                installs julia in <code>/usr/local/julia/bin</code>.
              </p>
              <p>
                If you fork a {projectLabelLower}, any changes that you make to
                the root image are also immediately visible in the fork. Thus
                you can install whatever you want anywhere in your{" "}
                {projectLabelLower}, then fork it to get an exact copy with
                everything preserved. You can of course also create your own
                images and publish them to any container registry, then your or
                anybody else can use them on CoCalc.
              </p>
            </div>
          )}

          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
            allowClear
          />
          <div style={{ marginTop: "15px" }}>
            <div style={{ marginBottom: "8px" }}>Recent Images:</div>
            {images.map((image) => (
              <Tag
                style={{
                  cursor: "pointer",
                  marginBottom: "8px",
                  padding: "6px",
                  fontSize: "11pt",
                }}
                color={image == value ? "#108ee9" : undefined}
                key={image}
                onClick={() => {
                  setValue(image);
                }}
              >
                {image}
                {image == DEFAULT_PROJECT_IMAGE ? " (default)" : ""}
              </Tag>
            ))}
          </div>
          <ShowError error={error} setError={setError} />
        </Modal>
      )}
    </div>
  );
}

function getImage(project) {
  const image = project?.get("rootfs_image")?.trim();
  return image ? image : DEFAULT_PROJECT_IMAGE;
}

async function getImages(project_id: string, compute_server_id = 0) {
  // [ ] TODO: this should really be the fs in the sandbox that runs on the file-server ALWAYS
  // but I don't have a way to express that yet.
  const fs = redux.getProjectActions(project_id).fs(0);
  const { stdout } = await fs.fd(
    join(PROJECT_IMAGE_PATH, `${compute_server_id}`),
    {
      options: ["-E", "workdir", "-E", "upperdir"],
    },
  );
  const v = Buffer.from(stdout)
    .toString()
    .split("\n")
    .map((x) => x.slice(0, -1))
    .filter((x) => x);
  const X = new Set(v);
  X.add(DEFAULT_PROJECT_IMAGE);
  const notLeaf = new Set<string>();
  for (const w of X) {
    notLeaf.add(dirname(w));
  }
  const w: string[] = [];
  for (const y of X) {
    if (notLeaf.has(y)) continue;
    w.push(y);
  }
  return w;
}

export async function setRootFilesystemImage({
  project_id,
  image,
}: {
  project_id: string;
  image: string;
}) {
  await webapp_client.query({
    query: {
      projects: {
        project_id,
        rootfs_image: image,
      },
    },
  });
}
