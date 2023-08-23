import { Checkbox, InputNumber, Modal } from "antd";
import { useMemo, useRef, useState } from "react";

import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { parse_number_input } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import type { QuotaParams } from "./types";
import { GPU_QUOTAS } from "@cocalc/util/upgrades/gpu";

interface Props {
  name: keyof QuotaParams;
  quotaState: Partial<QuotaParams> | null;
  setQuotaState: (state: Partial<QuotaParams> | null) => void;
  units?: string;
  max?: number;
  disabled?: boolean;
}

function ConfirmGPU({
  open,
  onOk,
  onCancel,
}: {
  open: boolean;
  onOk: () => void;
  onCancel: () => void;
}) {
  const [checked0, setChecked0] = useState<boolean>(false);
  const [checked1, setChecked1] = useState<boolean>(false);
  const disabled = useMemo(() => !checked0 || !checked1, [checked0, checked1]);
  return (
    <Modal
      title={
        <>
          <Icon name="exclamation-triangle" /> Shared GPU
        </>
      }
      open={open}
      maskClosable={false}
      onOk={() => {
        onOk();
      }}
      onCancel={() => {
        onCancel();
      }}
      okButtonProps={{ disabled }}
      okText={"Accept"}
    >
      <Paragraph>
        This pay-as-you-go upgrade will run your project on a machine with a
        shared NVIDIA T4 GPU. The quota parameters for this project are fixed.
        The GPU might not always be available. Additionally, the project will
        run in a different software environment, which is tailored to run
        scientific software on such a GPU. (Once this PAYG-upgrade is disabled,
        your project moves back to the usual stack of software.)
      </Paragraph>
      <Paragraph>
        This is an experimental new feature, and we are still working out the
        kinks. Please send us feedback!
      </Paragraph>
      <Paragraph>Please read and accept these licenses:</Paragraph>
      <Checkbox
        checked={checked0}
        onChange={(e) => setChecked0(e.target.checked)}
      >
        I accept{" "}
        <A href={"https://docs.nvidia.com/cuda/eula/index.html"}>
          NVIDIA CUDA Toolkit EULA
        </A>
      </Checkbox>
      <br />
      <Checkbox
        checked={checked1}
        onChange={(e) => setChecked1(e.target.checked)}
      >
        I accept{" "}
        <A href={"https://docs.nvidia.com/deeplearning/cudnn/sla/index.html"}>
          NVIDIA cuDNN EULA
        </A>
      </Checkbox>
      <br />
    </Modal>
  );
}

export default function EditQuota({
  name,
  quotaState,
  setQuotaState,
  units,
  max,
  disabled,
}: Props) {
  const [showGPU, setShowGPU] = useState<boolean>(false);
  const refMemoQuotaState = useRef<Partial<QuotaParams> | null>(null);

  if (quotaState == null) {
    return null;
  }

  function onChangeCheckbox(name, value: 0 | 1) {
    if (name === "gpu") {
      if (value === 1) {
        setShowGPU(true);
      } else {
        // restore previous
        const memo = refMemoQuotaState.current;
        if (memo != null) {
          setQuotaState({ ...memo, [name]: 0 });
          refMemoQuotaState.current = null;
        } else {
          setQuotaState({ ...quotaState, [name]: 0 });
        }
      }
    } else {
      setQuotaState({ ...quotaState, [name]: value });
    }
  }

  if (PROJECT_UPGRADES.params[name]?.input_type === "checkbox") {
    if (max != null && max == 0) {
      return (
        <Checkbox key={name} disabled style={{ marginLeft: 0 }}>
          Not supported
        </Checkbox>
      );
    }
    return (
      <>
        {name === "gpu" ? (
          <ConfirmGPU
            open={showGPU}
            onCancel={() => {
              setShowGPU(false);
            }}
            onOk={() => {
              setShowGPU(false);
              refMemoQuotaState.current = quotaState;
              setQuotaState(GPU_QUOTAS);
            }}
          />
        ) : null}
        <Checkbox
          key={name}
          checked={!!quotaState[name]}
          style={{ marginLeft: 0 }}
          onChange={(e) => onChangeCheckbox(name, e.target.checked ? 1 : 0)}
          disabled={disabled}
        >
          {quotaState[name] ? "Enabled" : "Disabled"}
        </Checkbox>
      </>
    );
  } else {
    return (
      <InputNumber
        status={
          // is this even a problem given InputNumber...?
          parse_number_input(quotaState[name]) == null ? "error" : undefined
        }
        addonAfter={
          units ? (
            <div style={{ width: "50px" }}>
              <b>{displayUnits(units)}</b>
            </div>
          ) : undefined
        }
        style={{ width: "175px" }}
        key={name}
        min={MIN[name] ?? 1}
        max={max}
        value={displayValue(quotaState[name], units)}
        step={1}
        onChange={(value) => {
          setQuotaState({
            ...quotaState,
            [name]: internalValue(value, units),
          });
        }}
        disabled={disabled}
      />
    );
  }
}

const MIN = {
  mintime: 0.25,
  cpu_shares: 0,
  memory_request: 0,
};

function displayValue(value, units) {
  if (value == null) return 1;
  if (units == "MB") {
    return value / 1000;
  }
  return value;
}

function displayUnits(units) {
  if (units == "MB") {
    return "GB";
  }
  if (units == "seconds") {
    return "hours";
  }
  return units;
}

function internalValue(value, units) {
  if (value == null) return value;
  if (units == "MB") {
    return value * 1000;
  }
  if (units == "seconds") {
    return value * 3600;
  }
  return value;
}
