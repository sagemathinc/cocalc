import { Progress, Spin, Tooltip } from "antd";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";

const SPEC = {
  compute: {
    icon: "server",
    label: "Compute",
    tip: "Jupyter kernel and terminal software environment",
  },
  filesystem: {
    icon: "files",
    label: "Filesystem",
    tip: "Service that manages mounting and syncing the /home/user filesystem",
  },
  "filesystem-sync": {
    icon: "sync",
    label: "Sync",
    tip: "Sync /home/user between compute server and project (except excluded directories)",
  },
  "filesystem-network": {
    icon: "network-wired",
    label: "Mount files",
    tip: "Network mounted /home/user filesystem",
  },
  vm: {
    icon: "desktop",
    label: "Virtual Machine",
    tip: "Underlying virtual machine on which the compute server containers are running",
  },
  install: {
    icon: "cloud-dev",
    label: "Install",
    tip: "Install Docker, Nodejs, and CoCalc software on the compute server",
  },
};

// order the components
const COMPONENTS = [
  "filesystem-sync",
  "compute",
  "filesystem",
  "filesystem-cache",
  "filesystem-network",
  "install",
  "vm",
];

export default function DetailedState({
  detailed_state,
  color,
  configuration,
}) {
  if (!detailed_state) {
    return null;
  }
  const v: JSX.Element[] = [];
  for (const name of COMPONENTS) {
    if (detailed_state[name]) {
      v.push(
        <State
          key={name}
          name={name}
          configuration={configuration}
          {...detailed_state[name]}
        />,
      );
    }
  }
  for (const name in detailed_state) {
    if (!COMPONENTS.includes(name)) {
      v.push(
        <State
          key={name}
          name={name}
          configuration={configuration}
          {...detailed_state[name]}
        />,
      );
    }
  }
  return (
    <div style={{ borderTop: `1px solid ${color}`, marginTop: "10px" }}>
      {v}
    </div>
  );
}

function toLabel(name: string) {
  if (!name) return "";
  return name
    .split("-")
    .map((x) => capitalize(x))
    .join(" ");
}

function State({ name, state, time, expire, progress, extra, configuration }) {
  const expired = expire && expire < Date.now();
  let label;
  if (name == "compute") {
    label = <DisplayImage configuration={configuration} />;
  } else if (SPEC[name]?.label) {
    label = SPEC[name].label;
  } else {
    label = toLabel(name);
  }

  return (
    <div style={{ borderBottom: "1px solid #ddd" }}>
      <div style={{ display: "flex" }}>
        <Tooltip title={SPEC[name]?.tip}>
          <div style={{ flex: 1, color: expired ? "#aaa" : undefined }}>
            {name != "compute" && (
              <>
                <Icon
                  name={SPEC[name]?.icon ?? "cube"}
                  style={{ marginRight: "5px" }}
                />{" "}
              </>
            )}
            {label}
          </div>
        </Tooltip>
        {!expired && (
          <>
            <div style={{ flex: 1 }}>
              {!expired && <Progress percent={progress ?? 0} size="small" />}
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              {state == "ready" ? (
                "Ready"
              ) : (
                <Tooltip title={toLabel(state)}>
                  <Spin size="small" />
                </Tooltip>
              )}
            </div>
            <div
              style={{
                flex: 1,
                textAlign: "center",
                overflow: "scroll",
                height: "30px",
              }}
            >
              {/* only show time when at least a minute in past to avoid annoying flicker */}
              {(time ?? 0) < Date.now() - 60 * 1000 && <TimeAgo date={time} />}
            </div>
          </>
        )}
      </div>
      {extra && (
        <div style={{ display: "flex" }}>
          <div style={{ flex: 0.33333 }} />
          <div style={{ flex: 0.66666 }}>{extra}</div>
        </div>
      )}
    </div>
  );
}
