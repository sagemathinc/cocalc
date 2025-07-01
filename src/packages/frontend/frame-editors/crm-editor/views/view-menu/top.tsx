import { Icon } from "@cocalc/frontend/components/icon";
import { TYPE_TO_ICON } from "../index";
import { Divider, Menu, Modal } from "antd";
import Count, { Stat } from "../count";
import { useSelected } from "../use-selection";
import { plural } from "@cocalc/util/misc";
import { useState } from "react";
import Export from "./export";
import TagAccounts from "./tag-accounts";
import { capitalize } from "@cocalc/util/misc";

export default function TopMenu({
  id,
  name,
  columns,
  dbtable,
  view,
  viewCount,
  tableLowerBound,
  data,
  title,
  primaryKey,
  refresh,
}) {
  const [modal, setModal] = useState<
    "csv-export" | "json-export" | "not-implemented" | "tag-accounts" | null
  >(null);
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
          label: (
            <Divider>
              {" "}
              <Icon name="gear" style={{ marginRight: "10px" }} /> Properties
            </Divider>
          ),
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
          ],
        },
        {
          type: "group",
          label: (
            <Divider>
              <Icon name="cloud-upload" style={{ marginRight: "10px" }} />{" "}
              Import
            </Divider>
          ),
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
              <Icon name="file-export" style={{ marginRight: "10px" }} /> Export
            </Divider>
          ),
          children: [
            {
              icon: <Icon name="csv" />,
              disabled: primaryKey != null && numSelected == 0,
              label:
                numSelected == 0
                  ? "Export CSV (select some records)"
                  : `Export ${selected?.size ?? 0} ${plural(
                      numSelected,
                      "record",
                    )} to CSV...`,
              key: "csv-export",
            },
            {
              icon: <Icon name="js-square" />,
              disabled: primaryKey != null && numSelected == 0,
              label:
                numSelected == 0
                  ? "Export JSON (select some records)"
                  : `Export ${selected?.size ?? 0} ${plural(
                      numSelected,
                      "record",
                    )} to JSON...`,
              key: "json-export",
            },
          ],
        },
      ],
    },
  ];
  if (dbtable == "crm_accounts") {
    items[0].children.unshift({
      type: "group",
      label: (
        <Divider>
          <Icon name="tags-outlined" style={{ marginRight: "10px" }} /> Tag
          Accounts
        </Divider>
      ),
      children: [
        {
          icon: <Icon name="tags-outlined" />,
          disabled: primaryKey != null && numSelected == 0,
          label:
            numSelected == 0
              ? "Tag Accounts (select some records)"
              : `Tag ${selected?.size ?? 0} ${plural(numSelected, "Account")}...`,
          key: "tag-accounts",
        },
      ],
    });
  }
  return (
    <>
      {modal == "csv-export" && (primaryKey == null || selected) && (
        <Export
          type="csv"
          title={title}
          selected={selected}
          onClose={() => setModal(null)}
          data={data}
          columns={columns}
          primaryKey={primaryKey}
        />
      )}
      {modal == "json-export" && (primaryKey == null || selected) && (
        <Export
          type="json"
          title={title}
          onClose={() => setModal(null)}
          selected={selected}
          data={data}
          columns={columns}
          primaryKey={primaryKey}
        />
      )}
      {modal == "tag-accounts" && (primaryKey == null || selected) && (
        <TagAccounts
          title={title}
          onClose={() => setModal(null)}
          selected={selected}
          data={data}
          columns={columns}
          primaryKey={primaryKey}
          refresh={refresh}
        />
      )}
      {modal == "not-implemented" && (
        <Modal
          open
          title="This menu item is not yet implemented."
          onCancel={() => {
            setModal(null);
          }}
          onOk={() => {
            setModal(null);
          }}
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
            case "tag-accounts":
              setModal(key);
              break;
            default:
              setModal("not-implemented");
          }
        }}
      />
    </>
  );
}
