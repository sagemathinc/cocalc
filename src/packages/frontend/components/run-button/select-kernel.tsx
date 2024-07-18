/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Select, Tooltip } from "antd";
import { OptionProps } from "antd/es/select";
import { fromJS } from "immutable";
import { sortBy } from "lodash";
import { useEffect, useState } from "react";

import Logo from "@cocalc/frontend/jupyter/logo";
import type { KernelSpec } from "@cocalc/jupyter/types";
import {
  KERNEL_POPULAR_THRESHOLD,
  get_kernels_by_name_or_language,
} from "@cocalc/jupyter/util/misc";
import { capitalize } from "@cocalc/util/misc";
import { getKernelInfo } from "./kernel-info";
import { KernelStar } from "./kernel-star";

export default function SelectKernel({
  //code,
  allowClear,
  disabled,
  kernel,
  kernelSpecs: kernelSpecsProp,
  onSelect,
  placeholder = "Kernel...",
  project_id,
  size,
  style = { flex: 1 },
}: {
  //code?: string;
  allowClear?: boolean;
  disabled?: boolean;
  kernel?: string;
  kernelSpecs?: KernelSpec[];
  onSelect: (name: string) => void;
  placeholder?: string;
  project_id?: string;
  size?: "large" | "middle" | "small";
  style?: React.CSSProperties;
}) {
  const [error, setError] = useState<string>("");
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null>(
    kernelSpecsProp ?? null
  );

  useEffect(() => {
    if (kernelSpecsProp != null) return;
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

  function entry(
    spec,
    prefix: "lang" | "kernel"
  ): Omit<OptionProps, "children"> {
    const { name, display_name } = spec;
    const lang = spec.language ? capitalize(spec.language) : "unknown";
    const desc = spec?.metadata?.cocalc?.description;
    const descTxt = desc ? ` (${desc})` : "";
    const kernelTxt = `"${display_name}"${descTxt}`;
    const title =
      prefix === "lang"
        ? `Language "${lang}" via kernel ${kernelTxt}`
        : `Kernel ${kernelTxt} interpreting language "${lang}"`;
    const key = `${prefix}-${name}`;
    const priority = spec?.metadata?.cocalc?.priority ?? 0;
    return {
      key,
      display_name,
      label: (
        <Tooltip key={key} title={title} placement="left">
          {project_id && (
            <Logo
              key={key}
              kernel={name}
              project_id={project_id}
              size={size === "large" ? undefined : 18}
              style={{ marginRight: "5px" }}
            />
          )}{" "}
          {display_name}
          <KernelStar priority={priority} />
        </Tooltip>
      ),
      value: name,
    };
  }

  function getOptions() {
    if (kernelSpecs == null) return [];
    const [byName, byLang] = get_kernels_by_name_or_language(
      fromJS(kernelSpecs) as any
    );

    // langs: all kenrels by language, then the popular ones by priority
    const langs: Omit<OptionProps, "children">[] = [];
    const popular: [Omit<OptionProps, "children">, number][] = [];

    byLang.forEach((names) => {
      const top = sortBy(
        names
          .map((name) => {
            const spec = byName.get(name)?.toJS() as unknown as KernelSpec;
            return { spec, priority: spec?.metadata?.cocalc?.priority ?? 0 };
          })
          .toJS(),
        "priority"
      ).pop();
      if (!top) return;
      const { spec, priority } = top as { spec: any; priority: number };
      const display_name = capitalize(spec.language ?? spec.name);
      const item = entry({ ...spec, display_name }, "lang");
      if (priority >= KERNEL_POPULAR_THRESHOLD) {
        popular.push([item, priority]);
      } else {
        langs.push(item);
      }
    });

    // below the above, we list all kernels by name
    const all = kernelSpecs
      .filter((spec) => !spec?.metadata?.cocalc?.disabled)
      .map((spec) => entry(spec, "kernel"));

    return [
      {
        label: "Popular",
        options: sortBy(popular, ([, p]) => -p).map(([item]) => item),
      },
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
          allowClear={allowClear}
          placeholder={placeholder}
          optionFilterProp="children"
          filterOption={(input, option) => {
            const entry = (option?.["display_name"] ?? "").toLowerCase();
            return entry.includes(input.toLowerCase());
          }}
          size={size}
          style={style}
          disabled={disabled}
          options={getOptions()}
          onChange={onSelect}
          value={kernel}
        />
      )}
    </>
  );
}
