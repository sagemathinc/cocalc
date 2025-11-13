import { Progress, Tooltip } from "antd";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";
import ShowError from "@cocalc/frontend/components/error";
import { setDetailedState } from "./api";
import SyncButton from "./sync-button";

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
    // no tip on purpose since button provides tip
  },
  "filesystem-cache": {
    icon: "disk-round",
    label: "Cache",
    tip: "Cache frequently read files from project on compute server",
  },
  "filesystem-network": {
    icon: "network-wired",
    label: "Mount",
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
  "vm",
  "filesystem",
  "filesystem-cache",
  "filesystem-network",
  "install",
];

export default function DetailedState({
  id,
  project_id,
  detailed_state,
  color,
  configuration,
}) {
  if (!detailed_state) {
    return null;
  }
  const v: React.JSX.Element[] = [];
  for (const name of COMPONENTS) {
    if (detailed_state[name]) {
      v.push(
        <State
          id={id}
          project_id={project_id}
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
          id={id}
          project_id={project_id}
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

function State({
  name,
  state,
  time,
  expire,
  progress,
  extra,
  configuration,
  project_id,
  id,
}) {
  const expired = expire && expire < Date.now();
  let label;
  if (name == "filesystem-sync") {
    let disabled = false;
    if (configuration?.excludeFromSync != null) {
      if (
        configuration.excludeFromSync.includes("~") ||
        configuration.excludeFromSync.includes(".")
      ) {
        disabled = true;
      }
    }
    label = (
      <SyncButton
        disabled={disabled}
        size="small"
        compute_server_id={id}
        project_id={project_id}
        time={time}
        syncing={
          !extra &&
          progress <
            80 /* 80 because the last per for read cache is not sync and sometimes gets stuck */
        }
      />
    );
  } else if (name == "compute") {
    label = <DisplayImage configuration={configuration} />;
  } else if (SPEC[name]?.label) {
    label = SPEC[name].label;
  } else {
    label = toLabel(name);
  }

  return (
    <div
      style={{
        borderBottom: "1px solid #ddd",
        height: "24px",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex" }}>
        <Tooltip title={SPEC[name]?.tip}>
          <div
            style={{
              flex: 1,
              color: expired ? "#aaa" : undefined,
            }}
          >
            {name != "compute" && name != "filesystem-sync" && (
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
                  <Icon name="run" />
                </Tooltip>
              )}
            </div>
            <div
              style={{
                flex: 1,
                textAlign: "center",
                height: "30px",
                overflow: "auto",
              }}
            >
              {/* only show time when at least a minute in past to avoid annoying flicker */}
              {(time ?? 0) < Date.now() - 60 * 1000 && <TimeAgo date={time} />}
            </div>
          </>
        )}
      </div>
      {extra && (
        <div
          style={{
            display: "flex",
          }}
        >
          <div style={{ flex: 0.1 }} />
          <div style={{ flex: 0.9 }}>
            {state == "error" ? (
              <ShowError
                style={{
                  marginBottom: "10px",
                  position: "absolute",
                  maxWidth: "400px",
                  zIndex: 1,
                }}
                error={extra}
                setError={() => {
                  setDetailedState({
                    id,
                    project_id,
                    name,
                    extra: "",
                    state: "ready",
                  });
                }}
              />
            ) : (
              extra
            )}
          </div>
        </div>
      )}
    </div>
  );
}
