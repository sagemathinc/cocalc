import { Progress } from "antd";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";

const SPEC = {
  compute: { icon: "server", label: "Jupyter and Terminals" },
  filesystem: { icon: "files", label: "Filesystem" },
  "filesystem-sync": { icon: "sync", label: "Sync /home/user" },
  "filesystem-network": {
    icon: "network-wired",
    label: "Mount /home/user",
  },
  "filesystem-cache": { icon: "microchip", label: "Cache /home/user" },
  vm: { icon: "desktop", label: "Virtual Machine" },
  cocalc: { icon: "cocalc-ring", label: "Install CoCalc" },
};

// order the components
const COMPONENTS = [
  "filesystem-sync",
  "compute",
  "filesystem",
  "filesystem-cache",
  "filesystem-network",
  "cocalc",
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
    <div style={{ borderTop: `1px solid ${color}`, marginTop: "5px" }}>{v}</div>
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
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1, color: expired ? "#aaa" : undefined }}>
        <Icon
          name={SPEC[name]?.icon ?? "cube"}
          style={{ marginRight: "5px" }}
        />{" "}
        {label}
      </div>
      {!expired && (
        <>
          {!extra && !expired && (
            <div style={{ flex: 1 }}>
              <Progress percent={progress} size="small" />
            </div>
          )}
          <div style={{ flex: 1, textAlign: "center" }}>{toLabel(state)}</div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <TimeAgo date={time} />
          </div>
          {extra && <div style={{ flex: 1 }}>{extra}</div>}
        </>
      )}
    </div>
  );
}
