import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Modal,
  Radio,
  Spin,
} from "antd";
import { useEffect, useState } from "react";

import { A, Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { checkInAll } from "@cocalc/frontend/compute/check-in";
import { CancelText } from "@cocalc/frontend/i18n/components";
import confirmCreateCloudFilesystem from "@cocalc/frontend/purchases/pay-as-you-go/confirm-create-cloud-filesystem";
import type {
  Compression,
  CreateCloudFilesystem,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  DEFAULT_CONFIGURATION,
  MAX_BLOCK_SIZE,
  MAX_CLOUD_FILESYSTEMS_PER_PROJECT,
  MIN_BLOCK_SIZE,
  RECOMMENDED_BLOCK_SIZE,
} from "@cocalc/util/db-schema/cloud-filesystems";
import Color, { randomColor } from "../color";
import { ProgressBarTimer } from "../state";
import Title from "../title";
import { createCloudFilesystem } from "./api";
import { BucketLocation, BucketStorageClass } from "./bucket";
import type { CloudFilesystems } from "./cloud-filesystems";

interface Props {
  project_id: string;
  cloudFilesystems: CloudFilesystems | null;
  refresh: Function;
}

export default function CreateCloudFilesystem({
  project_id,
  cloudFilesystems,
  refresh,
}: Props) {
  const [taken, setTaken] = useState<{
    ports: Set<number>;
    mountpoints: Set<string>;
  }>({ ports: new Set(), mountpoints: new Set() });
  useEffect(() => {
    if (cloudFilesystems == null) {
      return;
    }
    const v = Object.values(cloudFilesystems);
    setTaken({
      ports: new Set(v.map((x) => x.port)),
      mountpoints: new Set(v.map((x) => x.mountpoint)),
    });
  }, [cloudFilesystems]);
  const [creating, setCreating] = useState<boolean>(false);
  const [createStarted, setCreateStarted] = useState<Date>(new Date());
  const [editing, setEditing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [configuration, setConfiguration] =
    useState<CreateCloudFilesystem | null>(null);

  const reset = () => {
    setConfiguration({
      project_id,
      ...DEFAULT_CONFIGURATION,
      mountpoint: generateMountpoint(
        taken.mountpoints,
        DEFAULT_CONFIGURATION.mountpoint,
      ),
      color: randomColor(),
      // start mounted by default -- way less confusing
      mount: true,
      // bucket_location gets filled in by BucketLocation component on init
      bucket_location: "",
    });
  };

  const create = async () => {
    if (creating || configuration == null) {
      return;
    }
    try {
      setCreating(true);
      setCreateStarted(new Date());
      await confirmCreateCloudFilesystem();
      setCreateStarted(new Date());
      await createCloudFilesystem({
        ...configuration,
        position: getPosition(cloudFilesystems),
      });
      checkInAll(project_id); // cause filesystem to be noticed (and mounted) asap
      setEditing(false);
      reset();
      refresh();
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
          reset();
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
        Create Cloud File System... {creating ? <Spin /> : null}
      </Button>
      <Modal
        width={"900px"}
        onCancel={() => {
          setEditing(false);
          reset();
        }}
        open={editing && configuration != null}
        title={
          <div style={{ display: "flex", fontSize: "15pt" }}>
            <Icon name="disk-round" style={{ marginRight: "15px" }} /> Create a
            CoCalc Cloud File System
          </div>
        }
        footer={[
          <Button
            key="cancel"
            disabled={creating}
            onClick={() => {
              setEditing(false);
              reset();
            }}
          >
            <CancelText />
          </Button>,
          <Button key="ok" type="primary" disabled={creating} onClick={create}>
            <>
              Create Cloud File System{" "}
              {creating ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
            </>
          </Button>,
        ]}
      >
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "15px 0" }}
        />{" "}
        <Card
          style={{
            margin: "15px 0",
            border: `0.5px solid ${configuration?.color ?? "#f0f0f0"}`,
            borderRight: `10px solid ${configuration?.color ?? "#aaa"}`,
            borderLeft: `10px solid ${configuration?.color ?? "#aaa"}`,
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
          Select a meaningful title and color for your Cloud File System. You
          can change these at any time, and they do not impact anything else.
          <br />
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
            Mountpoint
          </Divider>
          <Mountpoint
            configuration={configuration}
            setConfiguration={setConfiguration}
            mountpoints={taken.mountpoints}
          />
          <Divider>
            <Icon
              name="disk-snapshot"
              style={{ fontSize: "16pt", marginRight: "15px" }}
            />{" "}
            Bucket
          </Divider>
          Your data is stored in a Google Cloud Storage bucket in a single
          region or multiregion bucket, and recently used data is cached locally
          on each compute server's disk.
          <BucketLocation
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <Divider>
            {advanced ? (
              <Button
                onClick={() => setAdvanced(false)}
                type="link"
                style={{ fontSize: "12pt" }}
              >
                <Icon name="eye-slash" /> Hide Advanced Settings
              </Button>
            ) : (
              <Button
                onClick={() => setAdvanced(true)}
                type="link"
                style={{ fontSize: "12pt" }}
              >
                <Icon name="eye" /> Show Advanced Settings...
              </Button>
            )}
          </Divider>
          {advanced && (
            <>
              <p>
                <b>What is it?:</b> The CoCalc Cloud File System is a fully
                POSIX compliant distributed file system built using{" "}
                <A href="https://juicefs.com/">JuiceFS</A>,{" "}
                <A href="https://docs.keydb.dev/">KeyDB</A> and{" "}
                <A href="https://cloud.google.com/storage">
                  Google Cloud Storage
                </A>
                .
              </p>
              <p>
                <b>Scope:</b> You can make up to{" "}
                {MAX_CLOUD_FILESYSTEMS_PER_PROJECT} cloud file systems per
                project. Cloud file systems can be instantly moved between
                projects.
              </p>
              <p>
                <b>Cost:</b> The cost is a slightly marked up version of{" "}
                <A href="https://cloud.google.com/storage/pricing">
                  Google Cloud Storage Pricing, which is highly competitive.
                </A>{" "}
                You can see how much your file system costs and why in realtime
                by clicking "Show Metrics" in the cloud file system menu. If
                your compute server and filesystem are in the same region, then
                data transfer fees at completely free, and you mainly pay for
                storage and operations (i.e., there is a fee per block of data
                that is uploaded).
              </p>
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
              {false && (
                <TrashDays
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
              )}
              <Divider>
                <Icon
                  name="database"
                  style={{ fontSize: "16pt", marginRight: "15px" }}
                />{" "}
                Data Storage
              </Divider>
              <div>
                <BucketStorageClass
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
                <Compression
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
                <BlockSize
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
              </div>
              <MountAndKeyDBOptions
                showHeader
                configuration={configuration}
                setConfiguration={setConfiguration}
              />
            </>
          )}
          {creating && (
            <div style={{ textAlign: "center", fontSize: "14pt" }}>
              Creating Cloud File System...{" "}
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

function Mountpoint({ configuration, setConfiguration, mountpoints }) {
  const taken = mountpoints.has(configuration.mountpoint);
  return (
    <div>
      Mount at <code>~/{configuration.mountpoint}</code> on all compute servers.
      You can change this when the file system is not mounted.
      <br />
      <Input
        status={taken ? "error" : undefined}
        style={{ marginTop: "10px" }}
        value={configuration.mountpoint}
        onChange={(e) => {
          setConfiguration({ ...configuration, mountpoint: e.target.value });
        }}
      />
      {taken && (
        <Alert
          style={{ margin: "10px 0" }}
          showIcon
          type="error"
          message="This mountpoint is already being used by another Cloud File System in this project. Please change the mountpoint."
        />
      )}
    </div>
  );
}

function Compression({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>
        <A href="https://juicefs.com/docs/community/internals/#data-compression">
          {EXTERNAL}
          Compression
        </A>
      </b>
      {NO_CHANGE}
      You can compress your data automatically.
      <Alert
        style={{ margin: "10px" }}
        showIcon
        type="info"
        message={`Recommendation: LZ4`}
        description={
          <>
            Do not enable compression if most of your data is already
            compressed. Otherwise, <A href="https://lz4.github.io/lz4">LZ4</A>{" "}
            is a good choice; it uses less CPU, and can save significant space.
            Use <A href="https://facebook.github.io/zstd">ZSTD</A> if a lot of
            your data is compressible and more CPU usage is OK.
          </>
        }
      />
      <div style={{ textAlign: "center", marginTop: "10px" }}>
        <Radio.Group
          onChange={(e) =>
            setConfiguration({ ...configuration, compression: e.target.value })
          }
          value={configuration.compression}
        >
          <Radio value={"lz4"}>LZ4 - faster performance</Radio>
          <Radio value={"zstd"}>ZSTD - better compression ratio</Radio>
          <Radio value={"none"}>None</Radio>
        </Radio.Group>
      </div>
    </div>
  );
}

function BlockSize({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>Block Size</b>
      {NO_CHANGE}
      The block size, which is between {MIN_BLOCK_SIZE} MB and {MAX_BLOCK_SIZE}{" "}
      MB, is an upper bound on the size of the objects that are stored in the
      cloud storage bucket.
      <Alert
        style={{ margin: "10px" }}
        showIcon
        type="info"
        message={`Recommendation: ${RECOMMENDED_BLOCK_SIZE} MB`}
        description={
          <>
            Larger block size reduces the number of PUT and GET operations, and
            they each cost money. Also, if you use an autoclass storage class,
            there is a monthly per-object cost.
          </>
        }
      />
      <div style={{ textAlign: "center" }}>
        <InputNumber
          size="large"
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
    </div>
  );
}

// The Juicefs Trash is REALLY WEIRD to use, and I also
// think it might cause corruption or problems, especially
// with keydb.  So do NOT enable this.
function TrashDays({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <A href="https://juicefs.com/docs/community/security/trash">
        <b style={{ fontSize: "13pt" }}>{EXTERNAL} Trash</b>
      </A>
      <br />
      Optionally store deleted files in{" "}
      <code>~/{configuration.mountpoint}/.trash</code> for a certain number of
      days. Set to 0 to disable. You <b>can</b> change this later, but it only
      impacts newly written data.
      <div style={{ textAlign: "center", marginTop: "5px" }}>
        <InputNumber
          size="large"
          style={{ width: "200px" }}
          addonAfter={"days"}
          min={0}
          value={configuration.trash_days}
          onChange={(trash_days) =>
            setConfiguration({
              ...configuration,
              trash_days: Math.round(trash_days ?? 0),
            })
          }
        />
      </div>
    </div>
  );
}

function Lock({ configuration, setConfiguration }) {
  return (
    <div>
      If you delete this filesystem, you will be asked to type this phrase to
      avoid mistakes. You can change this at any time.
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

export function MountAndKeyDBOptions({
  configuration,
  setConfiguration,
  showHeader,
  disabled,
}: {
  configuration;
  setConfiguration;
  showHeader;
  disabled?;
}) {
  const [details, setDetails] = useState<boolean>(false);
  return (
    <>
      {showHeader && (
        <Divider>
          <Icon
            name="database"
            style={{ fontSize: "16pt", marginRight: "15px" }}
          />
          Mount Options
        </Divider>
      )}
      <p>
        Changing the mount parameters can lead to filesystem corruption.
        <Button
          onClick={() => setDetails(!details)}
          style={{ marginLeft: "15px" }}
        >
          {details ? "Hide" : "Show"} Details...
        </Button>
      </p>
      {details && (
        <>
          <p>
            Mount options impact cache speed and other aspects of your
            filesystem, and{" "}
            <i>can only be changed when the file system is not mounted</i>. You
            can set any possible JuiceFS or KeyDB configuration, which will be
            used when mounting your file system. Be careful: changes here can
            make it so the file system will not mount (if that happens, unmount
            and undo your change); also, some options may cause corruption.
          </p>
          <MountOptions
            configuration={configuration}
            setConfiguration={setConfiguration}
            disabled={disabled}
          />
          <br />
          <KeyDBOptions
            configuration={configuration}
            setConfiguration={setConfiguration}
            disabled={disabled}
          />
        </>
      )}
    </>
  );
}

function MountOptions({
  configuration,
  setConfiguration,
  disabled,
}: {
  configuration;
  setConfiguration;
  disabled?;
}) {
  return (
    <div>
      <Button
        style={{ float: "right" }}
        type="text"
        disabled={disabled}
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
        {EXTERNAL} JuiceFS Mount Options
      </A>
      <br />
      <Input
        disabled={disabled}
        value={configuration.mount_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, mount_options: e.target.value });
        }}
      />
    </div>
  );
}

function KeyDBOptions({
  configuration,
  setConfiguration,
  disabled,
}: {
  configuration;
  setConfiguration;
  disabled?;
}) {
  return (
    <div>
      <Button
        style={{ float: "right" }}
        type="text"
        disabled={disabled}
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
        {EXTERNAL} KeyDB Config File Options
      </A>
      <br />
      The text below is placed at the end of keydb.conf and can be used to
      override or add to the keydb configuration used on each client.
      <Input.TextArea
        disabled={disabled}
        style={{ marginTop: "5px" }}
        rows={2}
        value={configuration.keydb_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, keydb_options: e.target.value });
        }}
      />
    </div>
  );
}

function generateMountpoint(mountpoints, base): string {
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

export const NO_CHANGE = (
  <div style={{ color: "#666" }}>
    <b>Cannot be changed later.</b>
    <br />
  </div>
);

export const EXTERNAL = (
  <Icon name="external-link" style={{ marginRight: "5px" }} />
);

// at least 1 bigger than any current one, so it is at the top
function getPosition(cloudFilesystems: CloudFilesystems | null): number {
  let position = 0;
  if (cloudFilesystems == null) return position;
  for (const cloudFilesystem of Object.values(cloudFilesystems)) {
    const pos = cloudFilesystem.position ?? cloudFilesystem.id;
    if (pos > position) {
      position = pos + 1;
    }
  }
  return position;
}
