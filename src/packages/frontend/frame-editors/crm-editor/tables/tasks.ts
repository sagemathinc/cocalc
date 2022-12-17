import { register } from "./tables";

register({
  name: "tasks",
  title: "Tasks",
  query: {
    crm_tasks: [
      {
        id: null,
        subject: null,
        description: null,
        status: null,
        due_date: null,
        created: null,
        done: null,
        closed: null,
        last_edited: null,
        progress: null,
        priority: null,
        related_to: null,
        person_id: null,
        created_by: null,
        last_modified_by: null,
        assignee: null,
        cc: null,
        tags: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
