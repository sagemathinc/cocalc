import { Table } from "./types";

Table({
  name: "system_notifications",
  fields: {
    id: {
      type: "uuid",
      desc: "primary key",
    },
    time: {
      type: "timestamp",
      desc: "time of this message",
    },
    text: {
      type: "string",
      desc: "the text of the message",
    },
    priority: {
      type: "string",
      pg_type: "VARCHAR(6)",
      desc: 'one of "info", or "high"',
    },
    done: {
      type: "boolean",
      desc: "if true, then this notification is no longer relevant",
    },
  },
  rules: {
    primary_key: "id",
    db_standby: "unsafe",
    anonymous: true, // allow users read access, even if not signed in
    pg_indexes: ["time"],
    user_query: {
      get: {
        pg_where: ["time >= NOW() - INTERVAL '1 hour'", "priority = 'high'"],
        pg_changefeed: "one-hour",
        throttle_changes: 3000,
        fields: {
          id: null,
          time: null,
          text: "",
          priority: "high",
          done: false,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          time: true,
          text: true,
          priority: true,
          done: true,
        },
      },
    },
  },
});

Table({
  name: "announcements",
  fields: {
    id: true,
    time: true,
    text: true,
    priority: true,
    done: true,
  },
  rules: {
    primary_key: "id",
    db_standby: "unsafe",
    anonymous: true, // allow users read access, even if not signed in
    virtual: "system_notifications",
    user_query: {
      get: {
        pg_where: ["time >= NOW() - INTERVAL '100 days'", "priority = 'info'"],
        pg_changefeed: "quarter",
        throttle_changes: 3000,
        fields: {
          id: null,
          time: null,
          text: "",
          priority: "info",
          done: false,
        },
      },
    },
  },
});
