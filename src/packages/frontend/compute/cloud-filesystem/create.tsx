import {
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Modal,
  Radio,
  Spin,
} from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { A, Icon } from "@cocalc/frontend/components";
import Color, { randomColor } from "../color";
import Title from "../title";
import type {
  CreateCloudFilesystem,
  Compression,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  MIN_BLOCK_SIZE,
  MAX_BLOCK_SIZE,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { DEFAULT_CONFIGURATION } from "@cocalc/util/db-schema/cloud-filesystems";
import { createCloudFilesystem } from "./api";
import { ProgressBarTimer } from "../state";

export default function CreateCloudFilesystem({
  project_id,
  cloudFilesystems,
  refresh,
}) {
  const [creating, setCreating] = useState<boolean>(false);
  const [createStarted, setCreateStarted] = useState<Date>(new Date());
  const [editing, setEditing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [configuration, setConfiguration] = useState<CreateCloudFilesystem>({
    project_id,
    ...DEFAULT_CONFIGURATION,
    mountpoint: generateMountpoint(
      cloudFilesystems,
      DEFAULT_CONFIGURATION.mountpoint,
    ),
    color: randomColor(),
  });

  const create = async () => {
    if (creating) {
      return;
    }
    try {
      setCreateStarted(new Date());
      setCreating(true);
      const id = await createCloudFilesystem(configuration);
      console.log("created", id);
      setEditing(false);
      setConfiguration({
        project_id,
        ...DEFAULT_CONFIGURATION,
        mountpoint: generateMountpoint(
          cloudFilesystems,
          DEFAULT_CONFIGURATION.mountpoint,
        ),
        color: randomColor(),
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      refresh();
      setCreating(false);
    }
  };

  return (
    <div style={{ textAlign: "center", margin: "15px 0" }}>
      <Button
        size="large"
        disabled={creating || editing}
        onClick={() => {
          setEditing(true);
        }}
        style={{
          marginRight: "5px",
          width: "80%",
          height: "auto",
          whiteSpace: "normal",
          padding: "10px",
          ...(creating
            ? {
                borderColor: "rgb(22, 119, 255)",
                backgroundColor: "rgb(230, 244, 255)",
              }
            : undefined),
        }}
      >
        <Icon
          name="server"
          style={{
            color: "rgb(66, 139, 202)",
            fontSize: "200%",
          }}
        />
        <br />
        Create Cloud Filesystem... {creating ? <Spin /> : null}
      </Button>
      <Modal
        width={"900px"}
        onCancel={() => {
          setEditing(false);
          setConfiguration({
            project_id,
            ...DEFAULT_CONFIGURATION,
            mountpoint: generateMountpoint(
              cloudFilesystems,
              DEFAULT_CONFIGURATION.mountpoint,
            ),
            color: randomColor(),
          });
        }}
        open={editing}
        okText={<>Create Cloud Filesystem {creating ? <Spin /> : undefined}</>}
        onOk={() => {
          create();
        }}
        destroyOnClose
        title={
          <div style={{ display: "flex", fontSize: "15pt" }}>
            <Icon name="disk-round" style={{ marginRight: "15px" }} /> Create a
            CoCalc Cloud Filesystem
          </div>
        }
      >
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "15px 0" }}
        />{" "}
        <p>
          CoCalc Cloud Filesystem is an infinitely scalable fully POSIX
          compliant distributed filesystem with efficient local caching. You can
          simultaneously use this distributed filesystem in all compute servers
          in your project, and there are no limits on how much you can store.
          You pay only for the data you store and for operations on it. Prices
          are highly competitive, and can be as low as $0.002/GB per month for
          archival data.
        </p>
        <p>
          CoCalc Cloud Filesystem is built using{" "}
          <A href="https://juicefs.com/">JuiceFS</A>,{" "}
          <A href="https://docs.keydb.dev/">KeyDB</A> and{" "}
          <A href="https://cloud.google.com/storage">Google Cloud Storage</A>.
        </p>
        <p>
          Create your filesystem below. You can change any setting later except
          the compression and block size parameters. You can make a large number
          of different cloud filesystems, and easily move a cloud filesystem
          between projects.
        </p>
        <Card
          style={{
            margin: "15px 0",
            border: `0.5px solid ${configuration.color ?? "#f0f0f0"}`,
            borderRight: `10px solid ${configuration.color ?? "#aaa"}`,
            borderLeft: `10px solid ${configuration.color ?? "#aaa"}`,
            ...(creating ? { opacity: 0.4 } : undefined),
          }}
        >
          <Divider>
            <Icon
              name="cloud-dev"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Title and Color
          </Divider>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1 }} />
            <EditTitle
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
            <div style={{ flex: 1 }} />

            <SelectColor
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
            <div style={{ flex: 1 }} />
          </div>
          <Divider>
            <Icon
              name="folder-open"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Where to Mount Filesystem
          </Divider>
          <Mountpoint
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <Divider>
            <Icon
              name="file-zip"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Filesystem Parameters <b>(cannot be changed later!)</b>
          </Divider>
          <div style={{ textAlign: "center" }}>
            <Compression
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
            <br />
            <BlockSize
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
          </div>
          <Divider>
            <Icon
              name="lock"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Safety
          </Divider>
          <Lock
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <Divider>
            <Icon
              name="gears"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Advanced Settings{" "}
            {advanced ? (
              ""
            ) : (
              <Button onClick={() => setAdvanced(true)} type="link">
                (show)
              </Button>
            )}
          </Divider>
          {advanced && (
            <>
              You can set any possible JuiceFS or KeyDB configuration below,
              which will be used when mounting your filesystem. Be careful since
              a mistake here could make it so the filesystem will not mount,
              though you can easily edit this and try again.
              <br />
              <MountOptions
                configuration={configuration}
                setConfiguration={setConfiguration}
              />
              <br />
              <KeyDBOptions
                configuration={configuration}
                setConfiguration={setConfiguration}
              />
            </>
          )}
          {creating && (
            <div style={{ textAlign: "center", fontSize: "14pt" }}>
              Creating Cloud Filesystem...{" "}
              <ProgressBarTimer
                startTime={createStarted}
                style={{ marginLeft: "10px" }}
              />
            </div>
          )}
          <ShowError
            error={error}
            setError={setError}
            style={{ margin: "15px 0" }}
          />
        </Card>
      </Modal>
    </div>
  );
}

function EditTitle({ configuration, setConfiguration }) {
  return (
    <Title
      editable
      title={configuration.title}
      onChange={(title) => setConfiguration({ ...configuration, title })}
    />
  );
}

function SelectColor({ configuration, setConfiguration }) {
  return (
    <Color
      editable
      color={configuration.color}
      onChange={(color) => setConfiguration({ ...configuration, color })}
    />
  );
}

function Mountpoint({ configuration, setConfiguration }) {
  return (
    <div>
      Mount at <code>~/{configuration.mountpoint}</code> on all compute servers.
      <br />
      <Input
        style={{ marginTop: "5px" }}
        value={configuration.mountpoint}
        onChange={(e) => {
          setConfiguration({ ...configuration, mountpoint: e.target.value });
        }}
      />
    </div>
  );
}

function Compression({ configuration, setConfiguration }) {
  return (
    <div>
      Compression
      <br />
      <Radio.Group
        onChange={(e) =>
          setConfiguration({ ...configuration, compression: e.target.value })
        }
        value={configuration.compression}
      >
        <Radio value={"lz4"}>LZ4 (fast)</Radio>
        <Radio value={"zstd"}>ZSTD (small)</Radio>
        <Radio value={"none"}>None</Radio>
      </Radio.Group>
    </div>
  );
}

function BlockSize({ configuration, setConfiguration }) {
  return (
    <div>
      Block Size (in MB)
      <br />
      <InputNumber
        style={{ width: "110px" }}
        addonAfter={"MB"}
        min={MIN_BLOCK_SIZE}
        max={MAX_BLOCK_SIZE}
        value={configuration.block_size}
        onChange={(block_size) =>
          setConfiguration({ ...configuration, block_size })
        }
      />
    </div>
  );
}

function Lock({ configuration, setConfiguration }) {
  return (
    <div>
      If you delete this filesystem later, you will be asked to type this
      phrase. Use this to avoid mistakes.
      <br />
      <Input
        style={{ marginTop: "5px", color: "red" }}
        value={configuration.lock}
        onChange={(e) => {
          setConfiguration({ ...configuration, lock: e.target.value });
        }}
      />
    </div>
  );
}

function MountOptions({ configuration, setConfiguration }) {
  return (
    <div>
      <Button
        style={{ float: "right" }}
        type="text"
        onClick={() => {
          setConfiguration({
            ...configuration,
            mount_options: DEFAULT_CONFIGURATION.mount_options,
          });
        }}
      >
        Reset
      </Button>
      <A href="https://juicefs.com/docs/community/command_reference#mount">
        JuiceFS Mount Options
      </A>
      <br />
      <Input
        value={configuration.mount_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, mount_options: e.target.value });
        }}
      />
    </div>
  );
}

function KeyDBOptions({ configuration, setConfiguration }) {
  return (
    <div>
      <Button
        style={{ float: "right" }}
        type="text"
        onClick={() => {
          setConfiguration({
            ...configuration,
            keydb_options: DEFAULT_CONFIGURATION.keydb_options,
          });
        }}
      >
        Reset
      </Button>
      <A href="https://docs.keydb.dev/docs/config-file/">
        KeyDB Config File Options
      </A>
      <br />
      The text below is placed at the end of keydb.conf and can be used to
      override or add to the keydb configuration used on each client.
      <Input.TextArea
        style={{ marginTop: "5px" }}
        rows={4}
        value={configuration.keydb_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, keydb_options: e.target.value });
        }}
      />
    </div>
  );
}

function generateMountpoint(cloudFilesystems, base): string {
  const mountpoints = new Set(cloudFilesystems.map((x) => x.mountpoint));
  if (!mountpoints.has(base)) {
    return base;
  }
  let i = 1;
  while (true) {
    const mountpoint = `${base}-${i}`;
    if (!mountpoints.has(mountpoint)) {
      return mountpoint;
    }
    i += 1;
  }
}
