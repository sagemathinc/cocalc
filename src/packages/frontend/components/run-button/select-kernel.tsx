/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Select, Tooltip } from "antd";
import { fromJS } from "immutable";
import { sortBy } from "lodash";
import { useEffect, useState } from "react";

import Logo from "@cocalc/frontend/jupyter/logo";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import {
  KERNEL_POPULAR_THRESHOLD,
  get_kernels_by_name_or_language,
} from "@cocalc/frontend/jupyter/util";
import { capitalize } from "@cocalc/util/misc";
import { getKernelInfo } from "./kernel-info";
import { KernelStar } from "./kernel-star";
import { OptionProps } from "antd/es/select";

export default function SelectKernel({
  //code,
  kernel,
  onSelect,
  disabled,
  project_id,
  allowClear,
  placeholder = "Kernel...",
  size,
  style = { flex: 1 },
  kernelSpecs: kernelSpecsProp,
}: {
  //code?: string;
  kernel?: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
  project_id?: string;
  allowClear?: boolean;
  placeholder?: string;
  size?: "large" | "middle" | "small";
  style?: React.CSSProperties;
  kernelSpecs?: KernelSpec[];
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
    const title =
      prefix === "lang"
        ? `Language "${lang}" via kernel "${display_name}"`
        : `Kernel "${display_name}" interpreting language "${lang}"`;
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
      fromJS(kernelSpecs)
    );

    const langs: Omit<OptionProps, "children">[] = [];
    const popular: Omit<OptionProps, "children">[] = [];

    byLang.forEach((names) => {
      const top = sortBy(
        names
          .map((name) => {
            const spec = byName.get(name)?.toJS() as KernelSpec;
            return { spec, priority: spec?.metadata?.cocalc?.priority ?? 0 };
          })
          .toJS(),
        "priority"
      ).pop();
      if (!top) return;
      const { spec, priority } = top;
      const display_name = capitalize(spec.language ?? spec.name);
      const item = entry({ ...spec, display_name }, "lang");
      if (priority >= KERNEL_POPULAR_THRESHOLD) {
        popular.push(item);
      } else {
        langs.push(item);
      }
    });

    // below, we list all kernels by name
    const all = kernelSpecs
      .filter((spec) => !spec?.metadata?.cocalc?.disabled)
      .map((spec) => entry(spec, "kernel"));

    return [
      { label: "Popular", options: popular },
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
