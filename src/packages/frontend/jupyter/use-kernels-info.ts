/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { fromJS } from "immutable";
import type * as immutable from "immutable";
import { useEffect, useMemo, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { getKernelInfo } from "@cocalc/frontend/components/run-button/kernel-info";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  Kernels,
  get_kernel_selection,
  get_kernels_by_name_or_language,
} from "@cocalc/jupyter/util/misc";

// This returns processed jupyter kernel specs
// ATTN: this is only valid inside the context of a specific project!
export function useJupyterKernelsInfo(): {
  kernel_selection;
  kernels_by_name: immutable.OrderedMap<string, immutable.Map<string, string>> | null;
  kernels_by_language: immutable.OrderedMap<string, immutable.List<string>> | null;
  refresh: Function;
  error: string;
} {
  const [cnt, setCnt] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [kernelSpecs, setKernelSpecs] = useState<Kernels | null>();
  const { isRunning, project_id } = useProjectContext();

  function refresh() {
    setCnt((cnt) => cnt + 1);
  }

  useEffect(() => refresh(), [isRunning]);

  useAsyncEffect(async () => {
    try {
      const kernelInfo = await getKernelInfo(project_id, isRunning);
      setKernelSpecs(fromJS(kernelInfo) as Kernels);
      setError("");
    } catch (err) {
      setError(`${err}`);
    }
  }, [project_id, cnt]);

  const { kernel_selection, kernels_by_name, kernels_by_language } =
    useMemo(() => {
      if (kernelSpecs != null) {
        const kernel_selection = get_kernel_selection(kernelSpecs);
        const [kernels_by_name, kernels_by_language] =
          get_kernels_by_name_or_language(kernelSpecs);
        return {
          kernel_selection,
          kernels_by_name,
          kernels_by_language,
        };
      } else {
        return {
          kernel_selection: null,
          kernels_by_name: null,
          kernels_by_language: null,
        };
      }
    }, [kernelSpecs, error, project_id]);

  return {
    kernel_selection,
    kernels_by_name,
    kernels_by_language,
    refresh,
    error,
  };
}
