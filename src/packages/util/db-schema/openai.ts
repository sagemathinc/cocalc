import { Table } from "./types";
import { CREATED_BY, ID } from "./crm";

export type WhenPay = "now" | "invoice" | "admin";

export interface PurchaseInfo {
  // TODO: maybe a stripe invoice id...?
  time: string; // iso timestamp
  quantity: number;
  stripe_invoice_id?: string;
}

export interface ChatGPT {
  id: number;
  when_pay: WhenPay;
  created: Date;
  created_by: string;
  title: string;
  cart: { description: SiteLicenseDescriptionDB; product: "site-license" }[];
  count: number;
  cost: number;
  tax: number;
  active: Date;
  expire: Date;
  cancel_by: Date;
  notes?: string;
  purchased?: PurchaseInfo;
}

Table({
  name: "chatgpt",
  fields: {
    id: ID,
    time: { type: "timestamp", desc: "When this particular chat happened." },
    account_id: CREATED_BY,
    input: {
      title: "Input",
      type: "string",
      desc: "Input text that was sent to chatgpt",
      render: {
        type: "markdown",
      },
    },
    output: {
      title: "Output",
      type: "string",
      desc: "Output text that was returned from chatgpt",
      render: {
        type: "markdown",
      },
    },
    total_tokens: {
      type: "integer",
      desc: "The total number of tokens involved in this API call.",
    },
  },
});
