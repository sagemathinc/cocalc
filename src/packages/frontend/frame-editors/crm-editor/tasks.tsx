import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText } from "./edit";
import { register } from "./tables";
import { Progress } from "antd";

register({
  name: "tasks",
  title: "Tasks",
  query: {
    crm_tasks: [
      {
        id: null,
        subject: null,
        due_date: null,
        created: null,
        closed: null,
        last_edited: null,
        status: null,
        progress: null,
        priority: null,
        related_to: null,
        person_id: null,
        created_by: null,
        last_modified_by: null,
        assignee: null,
        cc: null,
        tags: null,
        description: null,
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
      title: "Due",
      ellipsis: true,
      dataIndex: "due_date",
      key: "due_date",
      sorter: (a, b) => cmp_Date(a.due_date, b.due_date),
      render: (_, { due_date }) => <TimeAgo date={due_date} />,
    },
    {
      title: "Progress",
      dataIndex: "progress",
      key: "progress",
      render: (_, { progress }) => {
        // status options for progress bar are:
        //   'success' 'exception' 'normal' 'active'
        // Could base this on last_edited and actual status field
        const status = "active";
        return (
          <Progress
            percent={progress ? progress : 0}
            status={status}
            strokeColor={{ from: "#108ee9", to: "#87d068" }}
          />
        );
      },
    },
    {
      title: "Closed",
      ellipsis: true,
      dataIndex: "closed",
      key: "closed",
      sorter: (a, b) => cmp_Date(a.closed, b.closed),
      render: (_, { closed }) => <TimeAgo date={closed} />,
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
      sorter: (a, b) => cmp_Date(a.created, b.created),
      render: (_, { created }) => <TimeAgo date={created} />,
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
  expandable: {
    expandedRowRender: ({ id, description }) => (
      <EditableMarkdown
        id={id}
        field="description"
        defaultValue={description}
      />
    ),
  },
});
