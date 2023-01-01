import { Icon } from "@cocalc/frontend/components/icon";
import { TYPE_TO_ICON } from "../index";
import { Divider, Menu, Popover, Statistic } from "antd";
import Count from "../count";

export default function TopMenu({
  name,
  title,
  dbtable,
  view,
  viewCount,
  tableLowerBound,
}) {
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
          label: <Divider>Properties</Divider>,
          children: [
            {
              label: "Rename view",
              key: "rename",
            },
            {
              label: "Change view type",
              key: "change",
            },
            {
              label: "Duplicate view",
              key: "duplicate",
            },
            {
              label: "Copy another view's configuration",
              key: "copy",
            },
            {
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
              label: "Import CSV",
              key: "csv-import",
            },
            {
              label: "Import JSON",
              key: "json-import",
            },
          ],
        },
        {
          type: "group",
          label: <Divider>Export</Divider>,
          children: [
            {
              label: "Export CSV",
              key: "csv-export",
            },
            {
              label: "Export JSON",
              key: "json-export",
            },
          ],
        },
      ],
    },
  ];
  return (
    <Popover
      mouseEnterDelay={0.7}
      title={
        <>
          <Icon name={TYPE_TO_ICON[view]} /> {name}
        </>
      }
      placement="left"
      content={
        <div>
          Table: {title}
          <Divider>Statistics</Divider>
          <Statistic title="Results in Filtered View" value={viewCount} />
          <Count name={title} dbtable={dbtable} lowerBound={tableLowerBound} />
        </div>
      }
    >
      <Menu
        triggerSubMenuAction={"click"}
        items={items}
        style={{ marginLeft: "-20px" }}
      />
    </Popover>
  );
}
