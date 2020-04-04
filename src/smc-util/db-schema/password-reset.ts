import { Table } from "./types";

Table({
  name: "password_reset",
  rules: {
    primary_key: "id",
  },
  fields: {
    id: {
      type: "uuid",
    },
    email_address: {
      type: "string",
    },
    expire: {
      type: "timestamp",
    },
  },
});

Table({
  name: "password_reset_attempts",
  rules: {
    primary_key: "id",
    durability: "soft", // loss not serious, since used only for analytics and preventing attacks
    pg_indexes: ["time"],
  },
  fields: {
    id: {
      type: "uuid",
    },
    email_address: {
      type: "string",
    },
    ip_address: {
      type: "string",
      pg_type: "inet",
    },
    time: {
      type: "timestamp",
    },
  },
});
