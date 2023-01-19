import { Table } from "./types";
import { CREATED, CREATED_BY, ID } from "./crm";

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
    created_by: CREATED_BY,
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
          created_by: null,
          void: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          code: true,
          created: true,
          created_by: true,
          void: true,
        },
      },
    },
  },
});
