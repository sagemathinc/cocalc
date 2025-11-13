import { displayAcceleratorType } from "./accelerator";
import { plural } from "@cocalc/util/misc";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";

export default function Specs({ configuration, priceData, IMAGES }) {
  const gpu = configuration.acceleratorType
    ? `${configuration.acceleratorCount ?? 1} ${displayAcceleratorType(
        configuration.acceleratorType,
      )} ${plural(configuration.acceleratorCount ?? 1, "GPU")}, `
    : "";

  return (
    <div>
      {configuration.spot ? "Spot " : "Standard "} {configuration.machineType}{" "}
      with {gpu}
      {priceData ? (
        <span>
          <RamAndCpu
            machineType={configuration.machineType}
            priceData={priceData}
            inline
          />
        </span>
      ) : (
        ""
      )}
      , and a{" "}
      {configuration.diskSizeGb ??
        `at least ${getMinDiskSizeGb({ configuration, IMAGES })}`}{" "}
      GB{" "}
      {configuration.diskType?.includes("hyper") ? (
        "hyperdisk"
      ) : (
        <>
          {(configuration.diskType ?? "pd-standard") != "pd-standard"
            ? " SSD "
            : " HDD "}{" "}
          disk
        </>
      )}{" "}
      in {configuration.zone}.
    </div>
  );
}

export function RamAndCpu({
  machineType,
  priceData,
  style,
  inline,
}: {
  machineType: string;
  priceData;
  style?;
  inline?: boolean;
}) {
  const data = priceData.machineTypes[machineType];
  if (data == null) return null;
  const { memory } = data;
  let { vcpu } = data;
  if (!vcpu || !memory) return null;
  if (machineType == "e2-micro") {
    vcpu = "0.25-2";
  } else if (machineType == "e2-small") {
    vcpu = "0.5-2";
  } else if (machineType == "e2-medium") {
    vcpu = "1-2";
  }
  if (inline) {
    return (
      <span style={style}>
        {vcpu} {plural(vcpu, "vCPU")}, {memory} GB RAM
      </span>
    );
  }
  return (
    <div style={{ color: "#666", ...style }}>
      <b>{plural(vcpu, "vCPU")}: </b>
      <div
        style={{ width: "65px", textAlign: "left", display: "inline-block" }}
      >
        {vcpu}
      </div>
      <b>Memory:</b> {memory} GB
    </div>
  );
}
