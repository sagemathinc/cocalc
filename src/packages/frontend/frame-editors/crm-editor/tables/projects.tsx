import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { Image } from "antd";
import { register } from "./tables";
import { tableRender } from "../fields";

register({
  name: "projects",

  title: "Projects",

  query: {
    crm_projects: [
      {
        project_id: null,
        name: null,
        title: null,
        last_edited: null,
        created: null,
        users: null,
        avatar_image_tiny: null,
      },
    ],
  },

  columns: [
    {
      title: "Project",
      dataIndex: "title",
      key: "title",
      render: (title: string, { avatar_image_tiny }) => (
        <>
          {avatar_image_tiny && <Image src={avatar_image_tiny} />} {title}
        </>
      ),
    },
    {
      title: "Edited",
      dataIndex: "last_edited",
      key: "last_active",
      defaultSortOrder: "descend" as "descend",
      sorter: (a, b) => cmp_Date(a.last_edited, b.last_edited),
      render: (_, { last_edited }) => <TimeAgo date={last_edited} />,
      ellipsis: true,
    },
    {
      title: "Created",
      ellipsis: true,
      dataIndex: "created",
      key: "created",
      sorter: (a, b) => cmp_Date(a.last_edited, b.last_edited),
      render: (_, { last_edited }) => <TimeAgo date={last_edited} />,
    },
    {
      title: "project_id",
      dataIndex: "project_id",
      key: "project_id",
      ellipsis: true,
      render: tableRender("projects", "project_id"),
    },
    {
      title: "Users",
      dataIndex: "users",
      key: "users",
      render: tableRender("projects", "users"),
    },
  ],
});
