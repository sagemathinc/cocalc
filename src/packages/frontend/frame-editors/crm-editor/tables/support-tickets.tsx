import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableText } from "../edit";
import { register } from "./tables";

register({
  name: "support-tickets",
  title: "Support Tickets",
  query: {
    crm_support_tickets: [
      {
        id: null,
        subject: null,
        created: null,
        last_edited: null,
        assignee: null,
        cc: null,
        tags: null,
        type: null,
        priority: null,
        status: null,
      },
    ],
  },
  columns: [
    {
      title: "Subject",
      dataIndex: "subject",
      key: "subject",
      render: (value, { id }) => (
        <EditableText key={id} id={id} field="subject" defaultValue={value} />
      ),
      width: 300,
    },
    {
      title: "Id",
      dataIndex: "id",
      key: "id",
    },
    {
      title: "Edited",
      ellipsis: true,
      dataIndex: "last_edited",
      key: "last_edited",
      sorter: (a, b) => cmp_Date(a.last_edited, b.last_edited),
      render: (_, { last_edited }) => <TimeAgo date={last_edited} />,
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
      title: "Assignee",
      dataIndex: "assignee",
      key: "assignee",
      render: (_, record) => {
        return <>{JSON.stringify(record.assignee)}</>;
      },
    },
    {
      title: "CC:",
      dataIndex: "cc",
      key: "cc",
      render: (_, record) => {
        return <>{JSON.stringify(record.cc)}</>;
      },
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      render: (value, { id }) => (
        <EditableText key={id} id={id} field="tags" defaultValue={value} />
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (value, { id }) => (
        <EditableText key={id} id={id} field="type" defaultValue={value} />
      ),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      key: "priority",
      render: (value, { id }) => (
        <EditableText key={id} id={id} field="priority" defaultValue={value} />
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (value, { id }) => (
        <EditableText key={id} id={id} field="status" defaultValue={value} />
      ),
    },
  ],
  allowCreate: true,
  changes: true,
});
