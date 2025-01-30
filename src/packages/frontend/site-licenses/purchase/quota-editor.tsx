/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Editing a quota

 - shows user rows for cpu, ram, disk, member, and always_running: optional
 - they can edit all the rows.
 - optional: also shows rows for support and network that can't be edited
*/

// cSpell: ignore jsonpatch requiresMemberhosting

import {
  Button,
  Checkbox,
  Col,
  InputNumber,
  Row,
  Select,
  Typography,
} from "antd";

import { JsonEditor } from "@cocalc/frontend/admin/json-editor";
import {
  CSS,
  React,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  Gap,
  HelpIcon,
  Paragraph,
  TextInput,
} from "@cocalc/frontend/components";
import {
  LicenseIdleTimeouts,
  Uptime,
  requiresMemberhosting,
  untangleUptime,
} from "@cocalc/util/consts/site-license";
import { KUCALC_ON_PREMISES } from "@cocalc/util/db-schema/site-defaults";
import { COSTS, CostMap } from "@cocalc/util/licenses/purchase/consts";
import { User } from "@cocalc/util/licenses/purchase/types";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { plural, round1, test_valid_jsonpatch } from "@cocalc/util/misc";
import {
  extract_gpu,
  GPU_DEFAULT_RESOURCE,
  process_gpu_quota,
} from "@cocalc/util/types/gpu";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import { DEDICATED_VM_ONPREM_MACHINE } from "@cocalc/util/upgrades/consts";
import { Upgrades } from "@cocalc/util/upgrades/quota";

const { Text } = Typography;

const ROW_STYLE: CSS = {
  border: "1px solid #eee",
  padding: "5px",
  margin: "5px",
  borderRadius: "3px",
} as const;

const UNIT_STYLE: CSS = {
  padding: "0 5px",
  fontWeight: 400,
} as const;

function render_explanation(s): JSX.Element {
  return (
    <span style={{ color: "#888" }}>
      <Gap /> - {s}
    </span>
  );
}

interface Props {
  quota: SiteLicenseQuota;
  onChange: (change: SiteLicenseQuota) => void;
  hideExtra?: boolean; // hide extra boxes, etc. -- this is used for admin editing, where they know what is up.
  disabled?: boolean;
  show_advanced_default?: boolean; // if the "advanced" part should pop up by default
  adminMode?: boolean; // admins are allowed to e.g. set quota limit to 0 (i.e. for boost licenses)
}

export const QuotaEditor: React.FC<Props> = (props: Props) => {
  const {
    quota,
    onChange,
    hideExtra,
    disabled,
    show_advanced_default,
    adminMode = false,
  } = props;
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const isOnPrem = customize_kucalc === KUCALC_ON_PREMISES;
  const max_upgrades = useTypedRedux("customize", "max_upgrades");

  const [show_advanced, set_show_advanced] = useState<boolean>(
    show_advanced_default ?? false,
  );
  const [jsonPatchError, setJSONPatchError] = useState<string | undefined>(
    undefined,
  );

  const hosting_multiplier = useMemo(() => {
    return (
      (quota.member ? COSTS.custom_cost.member : 1) *
      (quota.always_running ? COSTS.custom_cost.always_running : 1) *
      (quota.member && quota.always_running ? COSTS.gce.non_pre_factor : 1)
    );
  }, [quota]);

  const col = hideExtra
    ? { control: 18, max: 6 }
    : { control: 8, max: 3, desc: 16 };

  function user(): User {
    if (quota.user == null) {
      throw Error("quota.user must be set");
    }
    return quota.user;
  }

  // for onprem setups, the max_upgrades site setting adjust the limits of cpu and memory quotas
  const custom_max: CostMap = React.useMemo(() => {
    if (!isOnPrem) return COSTS.custom_max;
    // otherwise, we make a copy and modify cpu or memory limits
    const max: CostMap = { ...COSTS.custom_max };

    if (max_upgrades == null) return max;
    function setQuotaMax(name: keyof CostMap, quota: keyof Upgrades) {
      let val = max_upgrades.get(quota);
      if (val == null) return;
      if (typeof val !== "number" || val < 0) return;
      switch (quota) {
        case "memory":
        case "memory_request":
          // this is not in MiB for historic reasons (but Math.round hides this anyways)
          val = val / 1000;
          break;
        case "cpu_shares":
          val = val / 1024;
          break;
      }
      max[name] = Math.round(val);
    }
    setQuotaMax("cpu", "cores");
    setQuotaMax("dedicated_cpu", "cpu_shares");
    setQuotaMax("ram", "memory");
    setQuotaMax("dedicated_ram", "memory_request");
    return max;
  }, [max_upgrades, isOnPrem]);

  const isDedicated =
    quota.dedicated_vm != null || quota.dedicated_disk != null;

  function render_cpu(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={adminMode ? 0 : COSTS.basic.cpu}
            max={custom_max.cpu}
            value={quota.cpu}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ cpu: Math.round(x) });
            }}
          />
          <Gap />
          <span style={UNIT_STYLE}>shared CPU {plural(quota.cpu, "core")}</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.cpu == custom_max.cpu}
            onClick={() => onChange({ cpu: custom_max.cpu })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              shared CPU cores (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.cpu *
                  hosting_multiplier,
              )}/CPU cores per month per project`}
              )
            </b>
            {render_explanation(
              "Google Cloud vCPUs shared with other projects (member hosting significantly reduces sharing)",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_ram(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={adminMode ? 0 : COSTS.basic.ram}
            max={custom_max.ram}
            value={quota.ram}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ ram: Math.round(x) });
            }}
          />
          <Gap />
          <span style={UNIT_STYLE}>shared GB RAM</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.ram == custom_max.ram}
            onClick={() => onChange({ ram: custom_max.ram })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              GB RAM (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.ram *
                  hosting_multiplier,
              )}/GB RAM per month per project`}
              )
            </b>
            {render_explanation("RAM may be shared with other users")}
          </Col>
        )}
      </Row>
    );
  }

  function render_dedicated_cpu(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={adminMode ? 0 : COSTS.basic.dedicated_cpu}
            max={custom_max.dedicated_cpu}
            value={quota.dedicated_cpu}
            onChange={(x) => {
              if (typeof x != "number") return;
              if (x <= 0) {
                onChange({ dedicated_cpu: undefined });
              } else {
                onChange({ dedicated_cpu: round1(x) });
              }
            }}
          />
          <Gap />
          <span style={UNIT_STYLE}>
            dedicated CPU {plural(quota.dedicated_cpu, "core")}
          </span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.dedicated_cpu == custom_max.dedicated_cpu}
            onClick={() =>
              onChange({ dedicated_cpu: custom_max.dedicated_cpu })
            }
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              dedicated CPU cores (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.dedicated_cpu *
                  hosting_multiplier,
              )}/CPU cores per month per project`}
              )
            </b>
            {render_explanation(
              "Google Cloud vCPUs NOT shared with other projects.  You can enter a fractional value, e.g., 0.5 for a half dedicated core.",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_dedicated_ram(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={adminMode ? 0 : COSTS.basic.dedicated_ram}
            max={custom_max.dedicated_ram}
            value={quota.dedicated_ram}
            onChange={(x) => {
              if (typeof x != "number") return;
              if (x <= 0) {
                onChange({ dedicated_ram: undefined });
              } else {
                onChange({ dedicated_ram: round1(x) });
              }
            }}
          />
          <Gap />
          <span style={UNIT_STYLE}>dedicated GB RAM</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.dedicated_ram == custom_max.dedicated_ram}
            onClick={() =>
              onChange({ dedicated_ram: custom_max.dedicated_ram })
            }
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              dedicated GB RAM (
              {`${money(
                COSTS.user_discount[user()] *
                  COSTS.custom_cost.dedicated_ram *
                  hosting_multiplier,
              )}/GB RAM per month per project`}
              )
            </b>
            {render_explanation("RAM is not shared with other users")}
          </Col>
        )}
      </Row>
    );
  }

  function render_disk(): JSX.Element | null {
    if (isOnPrem) return null;
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control - col.max}>
          <InputNumber
            disabled={disabled}
            min={adminMode ? 0 : COSTS.basic.disk}
            max={custom_max.disk}
            value={quota.disk}
            onChange={(x) => {
              if (typeof x != "number") return;
              onChange({ disk: Math.round(x) });
            }}
          />
          <Gap />
          <span style={UNIT_STYLE}>G disk space</span>
        </Col>
        <Col md={col.max}>
          <Button
            disabled={quota.disk == custom_max.disk}
            onClick={() => onChange({ disk: custom_max.disk })}
          >
            Max
          </Button>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            <b>
              G Disk Space (
              {`${money(
                COSTS.user_discount[user()] * COSTS.custom_cost.disk,
              )}/G disk per month per project`}
              )
            </b>
            {render_explanation(
              "store a larger number of files. Snapshots and file edit history is included at no additional charge.",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_member(): JSX.Element | null {
    if (isOnPrem) return null;
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox
            checked={quota.member}
            onChange={(e) => onChange({ member: e.target.checked })}
            disabled={
              disabled ||
              requiresMemberhosting(quota.idle_timeout) ||
              quota.always_running
            }
          >
            Member hosting
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            member hosting{" "}
            <b>(multiplies RAM/CPU price by {COSTS.custom_cost.member})</b>
            {render_explanation(
              "project runs on computers with far fewer other projects.  If not selected your project runs on very, very heavily loaded trial servers, which might be OK depending on your application.",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_ext_rw(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox
            checked={quota.ext_rw}
            disabled={disabled}
            style={{ fontWeight: "normal" }}
            onChange={(e) => onChange({ ext_rw: e.target.checked })}
          >
            <strong>
              Mount <code>/ext</code> volume read/writeable
            </strong>
            : intended for instructors/administrators.
          </Checkbox>
        </Col>
      </Row>
    );
  }

  function render_dedicated_vm_help(): JSX.Element {
    return (
      <HelpIcon title="Dedicated VM">
        <Paragraph>
          A dedicated virtual machine is part of your cluster. Due to its{" "}
          <A
            href={
              "https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/"
            }
          >
            kubernetes taint
          </A>
          , projects do not run on that node by default. The purpose of this
          license configuration is to tell the management job, which creates the
          pod for the project, to run the given project on exactly that node.
          This is accomplished by adding a toleration to the pod specification
          and selecting the dedicated VM node as the preferred node.
        </Paragraph>
        <Paragraph>
          To configure such a Dedicated VM node, add a new node to your
          kubernetes cluster and then add a taint and label in the following
          way:
        </Paragraph>
        <Paragraph code>
          kubectl taint nodes [node-name]
          cocalc-dedicated_vm=[taint_name]:NoSchedule
        </Paragraph>
        <Paragraph code>
          kubectl label nodes [node-name] cocalc-dedicated_vm=[taint_name]
        </Paragraph>
        <Paragraph type="secondary">
          Replace [node-name] with the name of the node in your cluster and
          [taint_name] with the name you did set here in this license
          configuration.
        </Paragraph>
        <Paragraph>
          Note: Do not forget to change the quota limits as well. In particular,
          you'll probably want to increase the shared CPU and RAM quotas. You
          can also increase the run limit of that license and change the idle
          timeout to e.g. "always running". Once you saved the license,
          double-check the quota configuration data – it will be displayed as a
          JSON object. An empty string as the dedicated VM's name will be
          interpreted as "no Dedicated VM".
        </Paragraph>
      </HelpIcon>
    );
  }

  function render_dedicated_vm(): JSX.Element {
    const dvm = quota.dedicated_vm;
    const text = (dvm != null && typeof dvm != "boolean" && dvm.name) || "";
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <strong>Run project on dedicated virtual machine named</strong>{" "}
          <TextInput
            disabled={disabled}
            type={"text"}
            on_change={(name) =>
              onChange({
                dedicated_vm: { name, machine: DEDICATED_VM_ONPREM_MACHINE },
              })
            }
            style={{
              fontWeight: "normal",
              display: "inline-block",
              margin: "0 10px",
            }}
            text={text}
          />{" "}
          {render_dedicated_vm_help()}
        </Col>
      </Row>
    );
  }

  function render_gpu_help(): JSX.Element {
    return (
      <HelpIcon title="GPU Support" maxWidth="500px">
        <Paragraph>
          This configures a license, which will cause the project to run on a
          GPU. You need to configure your VMs in your cluster in such a way,
          that requesting a GPU is possible.
        </Paragraph>
        <Paragraph>
          In particular, the pod will get the following resource limit:{" "}
          <code>nvidia.com/gpu: 1</code>, where the specific GPU resource name
          can be configured.
        </Paragraph>
        <Paragraph>
          On top of that, you can optionally specify a{" "}
          <Text strong>taint toleration</Text>. This helps with keeping all
          other project pods away from your GPU enabled nodes. e.g.{" "}
          <Text code>gpu=cocalc</Text> ends up as:{" "}
          <pre>
            {JSON.stringify({
              tolerations: [
                {
                  key: "gpu",
                  operator: "Equal",
                  value: "cocalc",
                  effect: "NoSchedule",
                },
              ],
            })}
          </pre>
        </Paragraph>
        <Paragraph>
          You can also specify a <Text strong>node selector</Text>, useful if
          you have several different types of GPU nodes in your cluster, and you
          want to restrict where the project can run. E.g.{" "}
          <Text code>gpu-type=nvidia-tesla-v100</Text> ends up as{" "}
          <pre>
            {JSON.stringify({
              nodeSelector: { "gpu-type": "nvidia-tesla-v100" },
            })}
          </pre>
        </Paragraph>
      </HelpIcon>
    );
  }

  function render_gpu(): JSX.Element {
    const {
      num = 0,
      toleration = "",
      nodeLabel = "",
      resource = GPU_DEFAULT_RESOURCE,
    } = extract_gpu(quota);

    const debug = process_gpu_quota(quota);

    // edit text and save button on the same row
    const style: CSS = { display: "inline-flex", gap: "5px" } as const;

    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Paragraph>
            <Checkbox
              checked={num > 0}
              disabled={disabled}
              style={{ fontWeight: "normal" }}
              onChange={(e) =>
                onChange({
                  gpu: {
                    num: e.target.checked ? Math.max(1, num) : 0,
                    toleration,
                    nodeLabel,
                    resource,
                  },
                })
              }
            >
              <Text strong>Configure GPU</Text> {render_gpu_help()}
            </Checkbox>
          </Paragraph>
        </Col>
        {num > 0 ? (
          <Col md={col.desc}>
            <Paragraph>
              <Text strong>Number of GPUs</Text>{" "}
              <InputNumber
                min={1}
                size={"small"}
                value={num}
                onChange={(num: number) =>
                  onChange({ gpu: { num, toleration, nodeLabel, resource } })
                }
              />{" "}
              (usually "1")
            </Paragraph>
            <Paragraph>
              <Text strong>GPU Resource</Text>{" "}
              <TextInput
                size={"small"}
                disabled={disabled}
                type={"text"}
                on_change={(resource) =>
                  onChange({
                    gpu: {
                      resource: resource.trim(),
                      toleration,
                      num,
                      nodeLabel,
                    },
                  })
                }
                style={style}
                text={resource}
              />{" "}
              (optional, default "{GPU_DEFAULT_RESOURCE}", alternatively e.g.
              "nvidia.com/mig-1g.5gb")
            </Paragraph>
            <Paragraph>
              <Text strong>Node selector:</Text>{" "}
              <TextInput
                size={"small"}
                disabled={disabled}
                type={"text"}
                on_change={(label) =>
                  onChange({
                    gpu: { nodeLabel: label.trim(), toleration, num, resource },
                  })
                }
                style={style}
                text={nodeLabel}
              />{" "}
              (optional, [1])
            </Paragraph>
            <Paragraph>
              <Text strong>Tolerate a taint:</Text>{" "}
              <TextInput
                size={"small"}
                disabled={disabled}
                type={"text"}
                on_change={(tol) =>
                  onChange({
                    gpu: { toleration: tol.trim(), nodeLabel, num, resource },
                  })
                }
                style={style}
                text={toleration}
              />{" "}
              (optional, [1])
            </Paragraph>
            <Paragraph type="secondary">
              [1] format: <code>key=value</code> or for taints, also{" "}
              <code>key</code> to tolerate the key regardless of value. Keep the
              field empty if you do not use label selectors or taints. Specify
              multiple ones via a "," comma. Below is a "debug" view.
            </Paragraph>
            <pre style={{ fontSize: "85%" }}>
              {JSON.stringify(debug, null, 2)}
            </pre>
          </Col>
        ) : undefined}
      </Row>
    );
  }

  function on_json_patch_change(patch: string): void {
    try {
      const patchObj = JSON.parse(patch);
      setJSONPatchError(undefined);
      if (test_valid_jsonpatch(patchObj)) {
        onChange({ patch }); // we save the string, not the object!
      } else {
        setJSONPatchError(
          'Must be a list of {`[{"op": "replace", "path": "…", "value": "…"}, …]`} objects.',
        );
      }
    } catch (err) {
      setJSONPatchError(`Unable to parse JSON: ${err}`);
    }
  }

  function render_patch_project_pod(): JSX.Element {
    const value = quota.patch ?? "[]";
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Paragraph type="secondary">
            Define a list of <A href={"https://jsonpatch.com/"}>JSON Patch</A>{" "}
            operations for the generated project pod specification. They'll be
            applied right before being submitted to the Kubernetes API. Beware,
            this gives you a lot of power!
          </Paragraph>
          {jsonPatchError && (
            <Text type="danger">
              JSON Patch Error: {jsonPatchError} – Learn more at{" "}
              <A href="https://jsonpatch.com/">JSON Patch</A>.
            </Text>
          )}
          <JsonEditor rows={15} onSave={on_json_patch_change} value={value} />
        </Col>
      </Row>
    );
  }

  function idleTimeoutUptimeOptions(): JSX.Element[] {
    const ret: JSX.Element[] = [];
    for (const [key, it] of Object.entries(LicenseIdleTimeouts)) {
      ret.push(
        <Select.Option key={key} value={key}>
          {it.label}
        </Select.Option>,
      );
    }
    ret.push(
      <Select.Option key={"always_running"} value={"always_running"}>
        Always running
      </Select.Option>,
    );
    return ret;
  }

  function onIdleTimeoutChange(val: Uptime) {
    const { always_running, idle_timeout } = untangleUptime(val);
    const next: Partial<SiteLicenseQuota> = { always_running, idle_timeout };
    if (requiresMemberhosting(val)) {
      next.member = true;
    }
    onChange(next);
  }

  function idleTimeoutExtra(): JSX.Element | undefined {
    if (hideExtra) return;
    return (
      <Col md={col.desc}>
        {
          <>
            <b>
              longer idle time increases price by up to{" "}
              {COSTS.custom_cost.always_running * COSTS.gce.non_pre_factor}{" "}
              times
            </b>{" "}
            {render_explanation(`If you leave your project alone, it will be shut down the latest
            after the selected interval.
            This is not 100% guaranteed, because
            projects may still restart due to maintenance or security reasons.
            Always running essentially disables this,
            because if the project stops for any reason, it will be automatically restarted.
            `)}
          </>
        }
      </Col>
    );
  }

  function render_idle_timeout(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control} style={{ whiteSpace: "nowrap" }}>
          <Select
            defaultValue={quota.idle_timeout ?? "short"}
            onChange={onIdleTimeoutChange}
          >
            {idleTimeoutUptimeOptions()}
          </Select>{" "}
          idle timeout
        </Col>
        {idleTimeoutExtra()}
      </Row>
    );
  }

  function render_support(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox checked={true} disabled={true}>
            <span style={disabled ? undefined : { color: "rgba(0,0,0,.65)" }}>
              Priority support
            </span>
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            priority support
            {render_explanation(
              "we prioritize your support requests much higher (included with all licensed projects)",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_network(): JSX.Element {
    return (
      <Row style={ROW_STYLE}>
        <Col md={col.control}>
          <Checkbox checked={true} disabled={true}>
            <span style={disabled ? undefined : { color: "rgba(0,0,0,.65)" }}>
              Network access
            </span>
          </Checkbox>
        </Col>
        {!hideExtra && (
          <Col md={col.desc}>
            network access
            {render_explanation(
              "project can connect to the Internet to clone git repositories, download files, send emails, etc.  (included with all licensed projects)",
            )}
          </Col>
        )}
      </Row>
    );
  }

  function render_show_advanced_link(): JSX.Element {
    if (show_advanced) {
      return (
        <a
          style={{ marginLeft: "5px", fontSize: "12pt" }}
          onClick={() => set_show_advanced(false)}
        >
          Hide advanced options
        </a>
      );
    } else
      return (
        <a
          style={{ marginLeft: "5px", fontSize: "12pt" }}
          onClick={() => set_show_advanced(true)}
        >
          Show advanced options...
        </a>
      );
  }

  function render_dedicated(): JSX.Element {
    return (
      <div style={ROW_STYLE}>
        We also offer <b>dedicated virtual machines</b>, which are usually a
        much better value than always running dedicated cpu's. Request a quote
        below and explain that you're interested in a dedicated VM.
      </div>
    );
  }

  if (isDedicated && !(isOnPrem && quota.dedicated_vm != null)) {
    return (
      <Typography.Text strong type="danger">
        Dear Admin: editing a Dedicated VM or Disk is not yet implemented.
      </Typography.Text>
    );
  }

  function render_advanced_onprem(): JSX.Element | undefined {
    if (!show_advanced || !isOnPrem) return;
    return (
      <>
        {render_ext_rw()}
        {render_dedicated_vm()}
        {render_gpu()}
        {render_patch_project_pod()}
      </>
    );
  }

  function render_advanced(): JSX.Element | undefined {
    if (!show_advanced) return;
    return (
      <>
        {render_member()}
        {render_idle_timeout()}
        {render_dedicated_cpu()}
        {render_dedicated_ram()}
        {!hideExtra && render_dedicated()}
        {render_advanced_onprem()}
      </>
    );
  }

  return (
    <>
      {render_cpu()}
      {render_ram()}
      {render_disk()}
      {!hideExtra && render_support()}
      {!hideExtra && render_network()}
      {render_show_advanced_link()}
      {render_advanced()}
    </>
  );
};
