import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { commas, plural } from "@cocalc/util/misc";
import { Popover, Table } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

export default function NVIDIA({
  gpu,
  count,
}: {
  gpu: keyof typeof GPU_SPECS;
  count: number;
}) {
  const spec = GPU_SPECS[gpu];
  return (
    <Popover
      title={
        <div style={{ fontSize: "13pt" }}>
          {spec != null && (
            <div style={{ float: "right" }}>
              {
                <A href={spec.datasheet}>
                  <Icon name="external-link" /> Datasheet
                </A>
              }
            </div>
          )}
          <Icon name="gpu" style={{ marginRight: "5px", fontSize: "16pt" }} />
          {count} NVIDIA {gpu} {plural(count, "GPU")}
        </div>
      }
      content={
        <div style={{ width: "500px" }}>
          <GPUSpecs gpu={gpu} count={count} />
        </div>
      }
    >
      <span
        style={{
          cursor: "pointer",
        }}
      >
        {count} × NVIDIA {gpu} {plural(count, "GPU")}
      </span>
    </Popover>
  );
}

export function GPUSpecs({ gpu, count }) {
  const spec = GPU_SPECS[gpu];
  if (spec == null) {
    console.warn({ gpu, GPU_SPECS });
    return null;
  }
  const dataSource = [
    {
      key: "memory",
      name: <b>GPU Memory</b>,
      value: `${commas(count * spec.memory)} GB`,
      per: `${commas(spec.memory)} GB`,
    },
    {
      key: "memory_bw",
      name: <b>Memory Bandwidth</b>,
      per: `${commas(spec.memory_bw)} GB/s`,
    },
  ];
  if (spec.cuda_cores) {
    dataSource.push({
      key: "cuda_cores",
      name: <b>CUDA cores</b>,
      value: commas(count * spec.cuda_cores),
      per: commas(spec.cuda_cores),
    });
  }
  if (spec.tensor_cores) {
    dataSource.push({
      key: "tensor_cores",
      name: <b>Tensor cores</b>,
      value: commas(count * spec.tensor_cores),
      per: commas(spec.tensor_cores),
    });
  }

  const columns = [
    {
      title: "",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Per GPU",
      dataIndex: "per",
      key: "per",
    },
    {
      title: "Total",
      dataIndex: "value",
      key: "value",
    },
  ];
  return (
    <div>
      <Table pagination={false} dataSource={dataSource} columns={columns} />
    </div>
  );
}
