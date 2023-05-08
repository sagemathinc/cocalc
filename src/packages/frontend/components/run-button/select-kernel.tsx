/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Select, Tooltip } from "antd";
import { fromJS } from "immutable";
import { useEffect, useState } from "react";

import Logo from "@cocalc/frontend/jupyter/logo";
import { get_kernels_by_name_or_language } from "@cocalc/frontend/jupyter/store";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import { capitalize } from "@cocalc/util/misc";
import { sortBy } from "lodash";
import { getKernelInfo } from "./kernel-info";

export default function SelectKernel({
  //code,
  kernel,
  onSelect,
  disabled,
  project_id,
}: {
  //code?: string;
  kernel?: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
  project_id?: string;
}) {
  const [error, setError] = useState<string>("");
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null>(null);
  useEffect(() => {
    (async () => {
      let kernelInfo;
      try {
        kernelInfo = await getKernelInfo(project_id);
      } catch (err) {
        setError(`${err}`);
        return;
      }
      setKernelSpecs(kernelInfo);
    })();
  }, []);

  function entry(spec, prefix) {
    const { name, display_name } = spec;
    return {
      key: `${prefix}-${name}`,
      display_name,
      label: (
        <Tooltip title={display_name} placement="left">
          {project_id && (
            <Logo kernel={name} size={18} style={{ marginRight: "5px" }} />
          )}{" "}
          {display_name}
        </Tooltip>
      ),
      value: name,
    };
  }

  function getOptions() {
    if (kernelSpecs == null) return [];
    const [byName, byLang] = get_kernels_by_name_or_language(
      fromJS(kernelSpecs)
    );

    // for each language, we keep the top priority kernel (or first in the list)
    const langs = byLang
      .map((names) => {
        let kernels = names
          .map((name) => {
            const spec = byName.get(name)?.toJS() as KernelSpec;
            return { spec, priority: spec?.metadata?.cocalc?.priority ?? 0 };
          })
          .toJS();
        const kernels2 = sortBy(kernels, "priority");
        return kernels2.pop();
      })
      .filter((top) => top != null)
      .map((top) => {
        const spec: KernelSpec = top.spec;
        const display_name = capitalize(spec.language ?? spec.name);
        return entry({ ...spec, display_name }, "lang");
      })
      .valueSeq()
      .toJS();

    // below, we list all kernels by name
    const all = kernelSpecs
      .filter((spec) => !spec?.metadata?.cocalc?.disabled)
      .map((spec) => entry(spec, "kernel"));

    return [
      { label: "Languages", options: langs },
      { label: "All Kernels", options: all },
    ];
  }

  return (
    <>
      {error && <Alert type="error" description={error} />}
      {!error && (
        <Select
          showSearch
          placeholder="Kernel..."
          optionFilterProp="children"
          filterOption={(input, option) => {
            const entry = (option?.["display_name"] ?? "").toLowerCase();
            return entry.includes(input.toLowerCase());
          }}
          style={{ flex: 1 }}
          disabled={disabled}
          options={getOptions()}
          onChange={onSelect}
          value={kernel}
        />
      )}
    </>
  );
}
