import { useEffect, useState } from "react";
import { getKernelInfo } from "./kernel-info";
import { Alert, Select, Tooltip } from "antd";
import Logo from "@cocalc/frontend/jupyter/logo";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";

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

  return (
    <>
      {error && <Alert type="error" description={error} />}
      {!error && (
        <Select
          showSearch
          placeholder="Kernel..."
          optionFilterProp="children"
          filterOption={(input, option) =>
            (option?.display_name ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          style={{ flex: 1 }}
          disabled={disabled}
          options={
            kernelSpecs != null
              ? kernelSpecs
                  ?.filter((spec) => !spec?.metadata?.["cocalc"]?.disabled)
                  .map((spec) => {
                    return {
                      display_name: spec.display_name,
                      label: (
                        <Tooltip title={spec.display_name} placement="left">
                          {project_id && (
                            <Logo
                              kernel={spec.name}
                              size={18}
                              style={{ marginRight: "5px" }}
                            />
                          )}{" "}
                          {spec.display_name}
                        </Tooltip>
                      ),
                      value: spec.name,
                    };
                  })
              : []
          }
          onChange={onSelect}
          value={kernel}
        />
      )}
    </>
  );
}
