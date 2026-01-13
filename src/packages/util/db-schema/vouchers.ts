import { Table } from "./types";
import { CREATED, CREATED_BY, ID, NOTES } from "./crm";
import { SCHEMA as schema } from "./index";
import type { MoneyValue } from "@cocalc/util/money";

export type WhenPay = "now" | "admin";

export interface PurchaseInfo {
  // TODO: maybe a stripe invoice id...?
  time: string; // iso timestamp
  quantity: number;
  stripe_invoice_id?: string;
}

export interface Voucher {
  id: number;
  when_pay: WhenPay;
  created: Date;
  created_by: string;
  title: string;
  count: number;
  cost: MoneyValue;
  tax: MoneyValue;
  active: Date;
  expire: Date;
  cancel_by: Date;
  notes?: string;
  purchased?: PurchaseInfo;
}

Table({
  name: "vouchers",
  fields: {
    id: ID,
    when_pay: {
      type: "string",
      desc: "When these vouchers are automatically paid for: now (=when they are created), invoice (=only redeemed vouchers when they expire), admin (=never).",
    },
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
    active: {
      title: "Active",
      type: "timestamp",
      desc: "When this voucher becomes active.",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    expire: {
      title: "Expire",
      type: "timestamp",
      desc: "When this voucher expires.",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    cancel_by: {
      title: "Cancel by this date",
      type: "timestamp",
      desc: "This voucher must be canceled by this date",
      render: {
        type: "timestamp",
        editable: true,
      },
    },
    count: {
      type: "number",
      title: "Count",
      desc: "How many voucher codes were created.",
    },
    cost: {
      type: "number",
      desc: "How much one voucher costs in dollars.",
      pg_type: "numeric(20,10)",
      render: { type: "number", editable: true, format: "money", min: 0 },
    },
    tax: {
      type: "number",
      desc: "How much sales tax in dollars for each redeemed voucher.",
      pg_type: "numeric(20,10)",
      render: { type: "number", editable: true, format: "money", min: 0 },
    },
    notes: NOTES,
    purchased: {
      type: "map",
      desc: "Object that describes the purchase once it is made:  {time:?, quantity:?, stripe_invoice_id:?}",
      render: { type: "purchased" },
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
          active: null,
          expire: null,
          cancel_by: null,
          title: null,
          count: null,
          cost: null,
          tax: null,
          when_pay: null,
          purchased: null,
        },
      },
      set: {
        fields: {
          created_by: "account_id",
          id: true,
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
          id: null,
          created_by: null,
          created: null,
          active: null,
          expire: null,
          cancel_by: null,
          title: null,
          count: null,
          cost: null,
          tax: null,
          notes: null,
          cart: null,
          when_pay: null,
          purchased: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          active: true,
          expire: true,
          cancel_by: true,
          title: true,
          cost: true,
          tax: true,
          notes: true,
          when_pay: true,
        },
      },
    },
  },
  fields: schema.vouchers.fields,
});

export interface VoucherCode {
  code: string;
  id: number;
  created: Date;
  when_redeemed?: Date;
  redeemed_by?: string;
  canceled?: Date;
  notes?: string;
  license_ids?: string[];
  purchase_ids?: number[]; // if voucher results in a credit to an account, this is the amount
}

Table({
  name: "voucher_codes",
  fields: {
    code: { type: "string", desc: "The random code the determines this." },
    id: {
      type: "integer",
      title: "Voucher id",
      desc: "The unique id of the voucher that this is a code for.",
    },
    created: CREATED, // technically redundant since the vouchers id determines this; however it is convenient to have.
    when_redeemed: {
      type: "timestamp",
      title: "When Redeemed",
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
    canceled: {
      type: "timestamp",
      title: "When Canceled",
      desc: "When this voucher code was canceled. This is used if the user redeems the code, then cancel before the cancel-by date, e.g., because they drop a class.",
      render: {
        type: "timestamp",
      },
    },
    license_ids: {
      title: "License IDs",
      type: "array",
      pg_type: "UUID[]",
      desc: "The ids of the licenses created when this voucher code was redeemed (if this was for a license)",
    },
    purchase_ids: {
      title: "Ids of Account Credits",
      type: "array",
      pg_type: "integer[]",
      desc: "If voucher results in credit to an account, these are the id's of the transaction in the purchases table. Technically a single voucher could have multiple cash vouchers on it (which is silly but allowed).",
    },
    notes: NOTES,
  },
  rules: {
    desc: "Voucher codes",
    primary_key: "code",
    user_query: {
      get: {
        pg_where: [{ "redeemed_by = $::UUID": "account_id" }],
        fields: {
          code: null,
          id: null,
          created: null,
          when_redeemed: null,
          redeemed_by: null,
          canceled: null,
          license_ids: null,
          purchase_ids: null,
        },
      },
    },
  },
});

Table({
  name: "crm_voucher_codes",
  rules: {
    virtual: "voucher_codes",
    primary_key: "code",
    user_query: {
      get: {
        pg_where: [],
        admin: true,
        fields: {
          code: null,
          id: null,
          created: null,
          when_redeemed: null,
          redeemed_by: null,
          notes: null,
          canceled: null,
          license_ids: null,
          purchase_ids: null,
        },
      },
      set: {
        admin: true,
        fields: {
          code: true,
          id: true,
          when_redeemed: true,
          redeemed_by: true,
          notes: true,
          canceled: true,
        },
      },
    },
  },
  fields: schema.voucher_codes.fields,
});
