import { Table } from "./types";

Table({
  name: "account_creation_actions",
  fields: {
    id: {
      type: "uuid",
      desc: "id",
    },
    action: {
      type: "map",
      desc:
        "Describes the action to carry out when an account is created with the given email_address.",
    },
    email_address: {
      type: "string",
      desc: "Email address of user.",
    },
    expire: {
      type: "timestamp",
      desc: "When this action should be expired.",
    },
  },
  rules: {
    desc:
      "Actions to carry out when accounts are created, triggered by the email address of the user.",
    primary_key: "id",
    pg_indexes: ["email_address"],
  },
});
