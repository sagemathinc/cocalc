import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText } from "./edit";
import { register } from "./tables";

register({
  name: "support-messages",
  title: "Support Messages",
  query: {
    crm_support_messages: [
      {
        id: null,
        ticket_id: null,
        created: null,
        last_edited: null,
        from_person_id: null,
        body: null,
        internal: null,
      },
    ],
  },
  columns: [
    {
      title: "Id",
      dataIndex: "id",
      key: "id",
    },
    {
      title: "Ticket Id",
      dataIndex: "ticket_id",
      key: "ticket_id",
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
      title: "From",
      dataIndex: "from_person_id",
      key: "from_person_id",
      render: (value, { id }) => (
        // TODO: hack for now
        <EditableText
          id={id}
          field="from_person_id"
          defaultValue={`${value}`}
        />
      ),
    },
    {
      title: "Subject",
      dataIndex: "subject",
      key: "subject",
      render: (value, { id }) => (
        <EditableText id={id} field="subject" defaultValue={value} />
      ),
    },
    {
      title: "Internal",
      dataIndex: "internal",
      key: "internal",
      render: (value, { id }) => (
        // TODO: need checkbox
        <EditableText id={id} field="internal" defaultValue={`${value}`} />
      ),
    },
  ],
  allowCreate: true,
  changes: true,
  expandable: {
    expandedRowRender: ({ id, body }) => (
      <EditableMarkdown id={id} field="body" defaultValue={body} />
    ),
  },
});
