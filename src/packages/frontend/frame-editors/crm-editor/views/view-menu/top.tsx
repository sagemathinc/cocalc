import { Icon } from "@cocalc/frontend/components/icon";
import { TYPE_TO_ICON } from "../index";
import { Divider, Menu } from "antd";
import Count, { Stat } from "../count";
import { useSelected } from "../use-selection";
import { plural } from "@cocalc/util/misc";
import { useState } from "react";
import Export from "./export";
import { capitalize } from "@cocalc/util/misc";

export default function TopMenu({
  id,
  name,
  dbtable,
  view,
  viewCount,
  tableLowerBound,
  data,
  title,
  rowKey,
}) {
  const [modal, setModal] = useState<"csv-export" | "json-export" | null>(null);
  const selected = useSelected({ id });
  const numSelected = selected?.size ?? 0;
  const items = [
    {
      label: (
        <div
          style={{
            display: "inline-block",
            maxWidth: "10em",
            overflowX: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <Icon name={TYPE_TO_ICON[view]} /> {name}
        </div>
      ),
      key: "top-menu",
      children: [
        {
          type: "group",
          label: (
            <Divider>
              {capitalize(view)} View of {title}
            </Divider>
          ),
          children: [
            {
              label: <Stat title="Visible results" value={viewCount} />,
              key: "results",
            },
            {
              label: <Count dbtable={dbtable} lowerBound={tableLowerBound} />,
              key: "count",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Properties</Divider>,
          children: [
            {
              icon: <Icon name="swap" />,
              label: "Change view type...",
              key: "change",
            },
            {
              icon: <Icon name="copy" />,
              label: "Copy another view's configuration...",
              key: "copy",
            },
            {
              icon: <Icon name="tags-outlined" />,
              label: "Duplicate view",
              key: "duplicate",
            },
            {
              icon: <Icon name="trash" />,
              danger: true,
              label: "Delete view",
              key: "delete",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Import</Divider>,
          children: [
            {
              icon: <Icon name="csv" />,
              label: "Import CSV...",
              key: "csv-import",
            },
            {
              icon: <Icon name="js-square" />,
              label: "Import JSON...",
              key: "json-import",
            },
          ],
        },
        {
          type: "group",
          label: (
            <Divider>
              <Icon name="file-export" /> Export
            </Divider>
          ),
          children: [
            {
              icon: <Icon name="csv" />,
              disabled: numSelected == 0,
              label:
                numSelected == 0
                  ? "Export CSV (select some records)"
                  : `Export ${selected?.size ?? 0} ${plural(
                      numSelected,
                      "record"
                    )} to CSV...`,
              key: "csv-export",
            },
            {
              icon: <Icon name="js-square" />,
              disabled: numSelected == 0,
              label:
                numSelected == 0
                  ? "Export JSON (select some records)"
                  : `Export ${selected?.size ?? 0} ${plural(
                      numSelected,
                      "record"
                    )} to JSON...`,
              key: "json-export",
            },
          ],
        },
      ],
    },
  ];
  return (
    <>
      {modal == "csv-export" && selected && (
        <Export
          type="csv"
          title={title}
          selected={selected}
          onClose={() => setModal(null)}
          data={data}
          rowKey={rowKey}
        />
      )}
      {modal == "json-export" && selected && (
        <Export
          type="json"
          title={title}
          onClose={() => setModal(null)}
          selected={selected}
          data={data}
          rowKey={rowKey}
        />
      )}
      <Menu
        selectable={false}
        style={{ background: numSelected == 0 ? undefined : "#a3d4ff" }}
        triggerSubMenuAction={"click"}
        items={items}
        onClick={({ key }) => {
          switch (key) {
            case "csv-export":
            case "json-export":
              setModal(key);
              break;
          }
        }}
      />
    </>
  );
}
