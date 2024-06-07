import {
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
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
  MAX_CLOUD_FILESYSTEMS_PER_PROJECT,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  DEFAULT_CONFIGURATION,
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES,
  GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC,
  GOOGLE_CLOUD_MULTIREGIONS,
  GOOGLE_CLOUD_REGIONS,
} from "@cocalc/util/db-schema/cloud-filesystems";
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

  const reset = () => {
    setConfiguration({
      project_id,
      ...DEFAULT_CONFIGURATION,
      mountpoint: generateMountpoint(
        cloudFilesystems,
        DEFAULT_CONFIGURATION.mountpoint,
      ),
      color: randomColor(),
    });
  };

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
          reset();
        }}
        open={editing}
        okText={<>Create Cloud Filesystem {creating ? <Spin /> : undefined}</>}
        onOk={() => {
          create();
        }}
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
          The CoCalc Cloud Filesystem is a scalable distributed filesystem with
          local caching. There are no limits on how many files you can store.
          You do not specify the size of a cloud filesystem in advance, and the
          cost per GB is typically much less than a compute server disk, but you
          pay for operations on files.
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
          Select a meaningful title and color for your Cloud Filesystem. You can
          change these at any time, and they do not impact anything else.
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
          />
          {advanced ? (
            <div style={{ marginTop: "15px", textAlign: "center" }}>
              <Button onClick={() => setAdvanced(false)} type="link">
                <Icon name="eye-slash" /> Hide Advanced Settings
              </Button>
            </div>
          ) : (
            <div style={{ marginTop: "15px", textAlign: "center" }}>
              <Button onClick={() => setAdvanced(true)} type="link">
                <Icon name="eye" /> Show Advanced Settings...
              </Button>
            </div>
          )}
          {advanced && (
            <>
              <p>
                The CoCalc Cloud Filesystem is a fully POSIX compliant
                distributed filesystem built using{" "}
                <A href="https://juicefs.com/">JuiceFS</A>,{" "}
                <A href="https://docs.keydb.dev/">KeyDB</A> and{" "}
                <A href="https://cloud.google.com/storage">
                  Google Cloud Storage
                </A>
                . It uses multimaster metdata replication so that file metadata
                is efficiently available on every compute server.
              </p>
              <p>
                You can change any advanced setting below later except
                compression, block size and bucket location.
              </p>
              <p>
                You can make up to {MAX_CLOUD_FILESYSTEMS_PER_PROJECT} cloud
                filesystems per project that are configured in different ways
                and use them all at once, and easily move a cloud filesystem to
                another project.
              </p>
              <p>
                The cost is a slightly marked up version of{" "}
                <A href="https://cloud.google.com/storage/pricing">
                  Google Cloud Storage Pricing.
                </A>{" "}
                The pricing is highly competitive but complicated; fortunately,
                you can easily check each day to see how much a given filesystem
                cost the previous day.
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
              <TrashDays
                configuration={configuration}
                setConfiguration={setConfiguration}
              />
              <Divider>
                <Icon
                  name="disk-snapshot"
                  style={{ fontSize: "16pt", marginRight: "15px" }}
                />{" "}
                Bucket: Location and Storage Class
              </Divider>
              Your data is stored in a Google Cloud Storage bucket in a single
              region or multiregion bucket, and recently used data is cached
              locally on each compute server's disk.
              <div>
                <BucketLocation
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
                <BucketStorageClass
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
              </div>
              <Divider>
                <Icon
                  name="settings"
                  style={{ fontSize: "16pt", marginRight: "15px" }}
                />{" "}
                Filesystem: Compression and Block Size
              </Divider>
              <div>
                <Compression
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
                <BlockSize
                  configuration={configuration}
                  setConfiguration={setConfiguration}
                />
              </div>
              <Divider>
                <Icon
                  name="gears"
                  style={{ fontSize: "16pt", marginRight: "15px" }}
                />
                Mount Options
              </Divider>
              Mount options impact cache speed and other aspects of your
              filesystem, and can be changed when the filesystem is not mounted.
              <br />
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
      You can change this when the filesystem is not mounted.
      <br />
      <Input
        style={{ marginTop: "10px" }}
        value={configuration.mountpoint}
        onChange={(e) => {
          setConfiguration({ ...configuration, mountpoint: e.target.value });
        }}
      />
    </div>
  );
}

function BucketStorageClass({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt" }}>
        <A href="https://cloud.google.com/storage/docs/storage-classes">
          Bucket Storage Class
        </A>
      </b>
      <br />
      The bucket storage class determines how much it costs to store and access
      your data, but has minimal impact on speed. You can change this at any
      time.
      <Select
        style={{ width: "100%", marginTop: "5px" }}
        options={GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES.map(
          (bucket_storage_class) => {
            return {
              value: bucket_storage_class,
              key: bucket_storage_class,
              label:
                GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC[
                  bucket_storage_class
                ] ?? bucket_storage_class,
            };
          },
        )}
        value={configuration.bucket_storage_class}
        onChange={(bucket_storage_class) =>
          setConfiguration({ ...configuration, bucket_storage_class })
        }
      />
    </div>
  );
}

const REGIONS = GOOGLE_CLOUD_MULTIREGIONS.concat(GOOGLE_CLOUD_REGIONS);
function BucketLocation({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>
        <A href="https://cloud.google.com/storage/docs/locations">
          Bucket Location
        </A>
      </b>
      {NO_CHANGE}
      You can use your cloud filesystem from any compute server in the world, in
      any cloud or on prem. However, data transfer will be faster and cheaper
      when the filesystem and compute server are physically close. <br />
      <Select
        showSearch
        style={{ width: "300px", marginTop: "5px" }}
        options={REGIONS.map((region) => {
          let label;
          if (!region.includes("-")) {
            label = `${region.toUpperCase()} (Multiregion)`;
          } else {
            label = region;
          }
          return { value: region, label, key: region };
        })}
        value={configuration.bucket_location}
        onChange={(bucket_location) =>
          setConfiguration({ ...configuration, bucket_location })
        }
      />
    </div>
  );
}

function Compression({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>Compression</b>
      {NO_CHANGE}
      You can optionally automatically compress all data that is stored to save
      money.
      <div style={{ textAlign: "center" }}>
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
    </div>
  );
}

function BlockSize({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>Block Size</b>
      {NO_CHANGE}
      The block size, which is between 1MB and 64MB, is an upper bound on the
      size of the chunks that are storied in the cloud storage bucket. Around
      4MB is the fastest, but 64MB means storing far less objects, which can
      make the longterm cost much more affordable. <br />
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

function TrashDays({ configuration, setConfiguration }) {
  return (
    <div style={{ marginTop: "10px" }}>
      <b style={{ fontSize: "13pt", color: "#666" }}>Trash</b>
      <br />
      <A href="https://juicefs.com/docs/community/security/trash">
        JuiceFS Trash
      </A>{" "}
      can be configured to store deleted files in{" "}
      <code>~/{configuration.mountpoint}/.trash</code> for a certain number of
      days. Set to 0 to disable. You can change this later.
      <div style={{ textAlign: "center" }}>
        <InputNumber
          size="large"
          style={{ width: "200px" }}
          addonAfter={"days trash"}
          min={0}
          value={configuration.trash_days}
          onChange={(trash_days) =>
            setConfiguration({ ...configuration, trash_days })
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

const NO_CHANGE = (
  <div style={{ color: "#666" }}>
    <b>Cannot be changed later.</b>
    <br />
  </div>
);
