import { register } from "./tables";

register({
  name: "tasks",
  title: "Tasks",
  query: {
    crm_tasks: [
      {
        subject: null,
        done: null,
        progress: null,
        tags: null,
        description: null,
        assignee: null,
        due_date: null,
        last_edited: null,
        status: null,
        priority: null,
        related_to: null,
        person: null,
        support_ticket: null,
        created_by: null,
        created: null,
        closed: null,
        last_modified_by: null,
        cc: null,
        id: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
