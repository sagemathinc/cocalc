/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A table of a list of public paths.
*/

import { Avatar, Space, Table } from "antd";
import Badge from "components/misc/badge";
import { PublicPath } from "lib/share/types";
import A from "components/misc/A";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { Icon } from "@cocalc/frontend/components/icon";
import { trunc_middle } from "@cocalc/util/misc";
import { SHARE_AUTHENTICATED_ICON } from "@cocalc/util/consts/ui";

import type { JSX } from "react";

function Description({
  description,
  maxWidth,
}: {
  description: string;
  maxWidth?: string;
}) {
  if (!description?.trim()) return null;
  return (
    <div
      style={{
        maxWidth,
        maxHeight: "4em",
        overflow: "auto",
        border: "1px solid #eee",
        borderRadius: "3px",
        padding: "5px",
      }}
    >
      <SanitizedMarkdown value={description} />
    </div>
  );
}

function LastEdited({ last_edited }: { last_edited: string }) {
  return <>{`${new Date(parseFloat(last_edited)).toLocaleString()}`}</>;
}

function Title({
  id,
  title,
  url,
  avatar_image_tiny,
}: {
  id: string;
  title: string;
  url?: string;
  avatar_image_tiny?: string;
}) {
  return (
    <A href={url ? `/${url}` : `/share/public_paths/${id}`}>
      {avatar_image_tiny && (
        <Avatar
          size={24}
          shape="square"
          icon={<img src={avatar_image_tiny} />}
          style={{ marginRight: "5px", marginTop: "-4px" }}
        />
      )}
      {trunc_middle(title, 48)}
    </A>
  );
}

function Visibility({ disabled, unlisted, vhost, authenticated }) {
  if (disabled) {
    return (
      <>
        <Icon name="lock" /> Private
      </>
    );
  }
  if (authenticated) {
    return (
      <>
        <Icon name={SHARE_AUTHENTICATED_ICON} /> Authenticated
      </>
    );
  }
  if (unlisted) {
    return (
      <>
        <Icon name="eye-slash" /> Unlisted
      </>
    );
  }
  if (vhost) {
    return <>Virtual Host: {vhost}</>;
  }
  return (
    <>
      <Icon name="eye" /> Listed
    </>
  );
}

function ViewsAndStars({ stars, views }) {
  return (
    <div style={{ display: "flex" }}>
      {views > 0 && (
        <div style={{ marginRight: "30px" }}>
          Views <Badge count={views} />
        </div>
      )}
      {stars > 0 && (
        <div>
          Stars <Badge count={stars} />
        </div>
      )}
    </div>
  );
}

// I'm using any[]'s below since it's too much of a pain dealing with TS for this.

const COLUMNS0: any[] = [
  {
    title: "Path",
    dataIndex: "path",
    key: "path",
    render: (title, record) => (
      <Title
        id={record.id}
        title={title}
        url={record.url}
        avatar_image_tiny={record.avatar_image_tiny}
      />
    ),
    responsive: ["sm"] as any,
    //sorter: field_cmp("path"),
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
    render: (description) => (
      <Description description={description} maxWidth="250px" />
    ),
    responsive: ["sm"] as any,
    //sorter: field_cmp("description"),
  },
  {
    title: "Last Modified",
    dataIndex: "last_edited",
    key: "last_edited",
    render: (last_edited) => <LastEdited last_edited={last_edited} />,
    responsive: ["sm"] as any,
    //sorter: field_cmp("last_edited"),
  },
  {
    title: "Stars",
    dataIndex: "stars",
    key: "stars",
    render: (stars) => <Badge count={stars} />,
    responsive: ["sm"] as any,
    //sorter: field_cmp("stars"),
  },
  {
    title: "Views",
    dataIndex: "counter",
    key: "counter",
    render: (counter) => <Badge count={counter} />,
    responsive: ["sm"] as any,
    //sorter: field_cmp("counter"),
  },
];

const COLUMNS: any[] = COLUMNS0.concat([
  {
    title: "Documents",
    responsive: ["xs"] as any,
    key: "path",
    render: (_, record) => {
      const { path, url, last_edited, id, description, stars, counter } =
        record;
      return (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Title title={path} id={id} url={url} />
          <Description description={description} />
          <LastEdited last_edited={last_edited} />
          <ViewsAndStars stars={stars} views={counter} />
        </Space>
      );
    },
  },
]);

const COLUMNS_WITH_VISIBILITY: any[] = COLUMNS0.concat([
  {
    title: "Visibility",
    dataIndex: "disabled",
    key: "disabled",
    render: (_, record) => (
      <Visibility
        disabled={record.disabled}
        unlisted={record.unlisted}
        authenticated={record.authenticated}
        vhost={record.vhost}
      />
    ),
    responsive: ["sm"] as any,
    //sorter: field_cmp(["disabled", "unlisted", "vhost", "authenticated"]),
  },
  {
    title: "Documents",
    responsive: ["xs"] as any,
    key: "path",
    render: (_, record) => {
      const { path, last_edited, id, description, stars, counter, url } =
        record;
      return (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Title title={path} id={id} url={url} />
          <Description description={description} />
          <LastEdited last_edited={last_edited} />
          <Visibility
            disabled={record.disabled}
            unlisted={record.unlisted}
            authenticated={record.authenticated}
            vhost={record.vhost}
          />
          <ViewsAndStars stars={stars} views={counter} />
        </Space>
      );
    },
  },
]);

interface Props {
  publicPaths?: PublicPath[];
}

export default function PublicPaths({ publicPaths }: Props): JSX.Element {
  let showVisibility = false;
  if (publicPaths) {
    for (const path of publicPaths) {
      const { disabled, unlisted, authenticated } = path;
      if (disabled || unlisted || authenticated) {
        showVisibility = true;
        break;
      }
    }
  }
  return (
    <Table
      pagination={false}
      rowKey={"id"}
      loading={publicPaths == null}
      dataSource={publicPaths}
      columns={showVisibility ? COLUMNS_WITH_VISIBILITY : COLUMNS}
      style={{ overflowX: "auto" }}
    />
  );
}
