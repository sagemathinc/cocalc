import { Alert, Checkbox, Switch } from "antd";
import { useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";

export default function NestedVirtualization({
  setConfig,
  configuration,
  loading,
}) {
  const [enableNestedVirtualization, setEnableNestedVirtualization] =
    useState<boolean>(!!configuration.enableNestedVirtualization);
  const [help, setHelp] = useState<boolean>(false);

  return (
    <div>
      <div style={{ color: "#666", marginBottom: "5px" }}>
        <div>
          <b>
            <Switch
              size="small"
              checkedChildren={"Help"}
              unCheckedChildren={"Help"}
              style={{ float: "right" }}
              checked={help}
              onChange={(val) => setHelp(val)}
            />
            <Icon name="users" /> Enable Nested Virtualization
          </b>
        </div>
        {help && (
          <Alert
            showIcon
            style={{ margin: "15px 0" }}
            type="info"
            message={"Enable Nested Virtualization"}
            description={
              <div>
                <ul>
                  <li>
                    Enable this option to run full VM's inside of this compute
                    server.
                  </li>
                  <li>
                    There is roughly{" "}
                    <A href="https://cloud.google.com/compute/docs/instances/nested-virtualization/overview">
                      a 10% performance penalty
                    </A>
                    .
                  </li>
                  <li>
                    One way to run a VM is to ssh into the compute server as
                    root, install <A href="https://multipass.run/">Multipass</A>{" "}
                    by typing <code>snap install multipass</code> then use any
                    multipass command, e.g., <code>multipass launch</code>.
                  </li>
                  <li>
                    Nested virtualization is only supported for Intel processes
                    on non-E2 general-purpose, or A3 accelerator-optimized
                    servers.{" "}
                    <b>
                      The currently selected machine type is{" "}
                      {isSupported(configuration) ? "" : " NOT "} supported.
                    </b>
                  </li>
                  <li>
                    NOTE: All compute servers fully support running Docker
                    containers without this option. This is for running full
                    virtual machines.
                  </li>
                </ul>
              </div>
            }
          />
        )}
        <Checkbox
          style={{ marginTop: "5px" }}
          disabled={loading || !isSupported(configuration)}
          checked={enableNestedVirtualization && isSupported(configuration)}
          onChange={() => {
            setConfig({
              enableNestedVirtualization: !enableNestedVirtualization,
            });
            setEnableNestedVirtualization(!enableNestedVirtualization);
          }}
        >
          Enable Nested Virtualization: make it possible to run full VM's inside
          of this compute server
        </Checkbox>
      </div>
    </div>
  );
}

function isSupported(configuration) {
  const { machineType } = configuration;
  if (!machineType) {
    return false;
  }
  if (machineType.startsWith("a3")) {
    return false;
  }
  if (machineType.startsWith("e2")) {
    return false;
  }
  const i = machineType.indexOf("-");
  if (i == -1) {
    return false;
  }
  const x = machineType[i - 1];
  if (x == "a" || x == "d") {
    return false;
  }
  return true;
}
