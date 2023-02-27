import { Table } from "./types";
import { CREATED, CREATED_BY, ID } from "./crm";
import { SCHEMA as schema } from "./index";

Table({
  name: "vouchers",
  fields: {
    id: ID,
    created_by: CREATED_BY,
    created: CREATED,
    title: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Title of this voucher.",
      render: {
        type: "text",
        maxLength: 254,
        editable: true,
      },
    },
    expire: {
      title: "Due",
      type: "timestamp",
      desc: "When this voucher expires.",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    cancel_by: {
      title: "Cancel by this date.",
      type: "timestamp",
      desc: "This voucher must be cancelled by this date.",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    cart: {
      // items in the shopping cart that were used to create this voucher.  This defines
      // what the voucher provides.
      type: "map",
      pg_type: "JSONB[]",
      desc: "Cart of items provided by this voucher.",
    },
    cost: {
      type: "number",
      desc: "How much one voucher costs in dollars.",
      render: { type: "number", editable: true, format: "money", min: 0 },
    },
    tax: {
      type: "number",
      desc: "How much sales tax in dollars for each redeemed voucher.",
      render: { type: "number", editable: true, format: "money", min: 0 },
    },
  },
  rules: {
    desc: "Vouchers",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [{ "created_by = $::UUID": "account_id" }],
        fields: {
          id: null,
          created_by: null,
          created: null,
          expire: null,
          title: null,
        },
      },
      set: {
        fields: {
          created_by: "account_id",
          id: true,
          title: true,
        },
      },
    },
  },
});

Table({
  name: "crm_vouchers",
  rules: {
    virtual: "vouchers",
    primary_key: "id",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          ...schema.vouchers.user_query?.get?.fields,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          created_by: true,
          title: true,
        },
      },
    },
  },
  fields: schema.vouchers.fields,
});

Table({
  name: "voucher_codes",
  fields: {
    code: { type: "string", desc: "The random code the determines this." },
    id: {
      type: "integer",
      desc: "The unique id of the voucher that this is a code for.",
    },
    when_redeemed: {
      type: "timestamp",
      title: "When Redeeemed",
      desc: "When this voucher code was redeemed.",
      render: {
        type: "timestamp",
      },
    },
    redeemed_by: {
      type: "uuid",
      desc: "The uuid of the account that redeemed this voucher code.",
      render: { type: "account" },
      title: "Account",
    },
    note: { type: "string", desc: "The random code the determines this." }, // TODO
  },
  rules: {
    desc: "Voucher codes",
    primary_key: "code",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          code: null,
          id: null,
          when_redeemed: null,
          redeemed_by: null,
        },
      },
    },
  },
});
