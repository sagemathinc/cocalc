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
        description: null,
        due_date: null,
        tags: null,
        created: null,
        closed: null,
        last_edited: null,
        status: null,
        priority: null,
        related_to: null,
        person_id: null,
        created_by: null,
        last_modified_by: null,
        assignee: null,
        cc: null,
        id: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
