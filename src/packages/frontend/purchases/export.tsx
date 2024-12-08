import type { CSSProperties } from "react";
import { Button, Popover } from "antd";
import { stringify as csvStringify } from "csv-stringify/sync";
import { Icon } from "@cocalc/frontend/components/icon";
import { plural } from "@cocalc/util/misc";

interface Props {
  name: string;
  data: object[] | null | undefined;
  style?: CSSProperties;
}
export default function ExportPurchases({ name, data, style }: Props) {
  if (data == null) return null;
  return (
    <div style={style}>
      <Popover
        placement="left"
        content={() => {
          if (data == null) return null;
          const json = JSON.stringify(data, undefined, 2);
          const columns = data
            ? Array.from(new Set(data.flatMap(Object.keys)))
            : [];
          const csv = data
            ? csvStringify(data, {
                header: true,
                columns,
              })
            : "";
          return (
            <div>
              <Button
                type="link"
                href={URL.createObjectURL(
                  new Blob([csv], {
                    type: "text/plain",
                  }),
                )}
                download={`${name}.csv`}
              >
                <Icon name="csv" /> {name}.csv
              </Button>
              <Button
                type="link"
                href={URL.createObjectURL(
                  new Blob([json], {
                    type: "text/plain",
                  }),
                )}
                download={`${name}.json`}
              >
                <Icon name="js-square" /> {name}.json
              </Button>
            </div>
          );
        }}
        title={
          <>
            <Icon name="cloud-download" style={{ marginRight: "8px" }} />{" "}
            Download {data.length} {plural(data.length, "Transaction")} as CSV
            or JSON
          </>
        }
        trigger="click"
      >
        <Button disabled={data == null} type="link">
          <Icon name="cloud-download" /> Download
        </Button>
      </Popover>
    </div>
  );
}
