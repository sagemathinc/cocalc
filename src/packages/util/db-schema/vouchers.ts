import { Table } from "./types";
import { CREATED, ID } from "./crm";

Table({
  name: "vouchers",
  fields: {
    id: ID,
    code: {
      type: "string",
      pg_type: "VARCHAR(254)",
      unique: true,
      desc: "The unique code that a user types in or sees for this voucher.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    created: CREATED,
    void: {
      type: "boolean",
      desc: "True if this voucher was voided, so it can't be used.",
      render: {
        type: "boolean",
        editable: true,
      },
    },
  },
  rules: {
    desc: "Vouchers",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          id: null,
          code: null,
          created: null,
          void: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          code: true,
          created: true,
          void: true,
        },
      },
    },
  },
});
