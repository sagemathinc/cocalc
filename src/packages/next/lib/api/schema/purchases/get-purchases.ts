import { z } from "../../framework";

import { FailedAPIOperationSchema, MoneyValueSchema } from "../common";
import { ProjectIdSchema } from "../projects/common";

import {
  DayStatementIdSchema,
  InvoiceIdSchema,
  MonthStatementIdSchema,
  PurchaseIdSchema,
} from "./common";

const PurchaseServiceSchema = z
  .string()
  .describe("The service being charged for, e.g., `openai-gpt-4`, etc.");

// OpenAPI spec
//
export const GetPurchasesInputSchema = z
  .object({
    limit: z
      .number()
      .default(100)
      .describe("Upper bound on the number of purchases to return.")
      .nullish(),
    offset: z
      .number()
      .describe("Number of purchases by which to offset results.")
      .nullish(),
    service: PurchaseServiceSchema.nullish(),
    compute_server_id: z
      .number()
      .describe(
        "Only get purchases involving this compute server.  The id must be the *global* compute server id, not the one local to this project.   NOTE: This gets purchases for whoever is the *owner* of the compute server, which might not be the user requesting the purchases.",
      )
      .nullish(),
    project_id: ProjectIdSchema.describe(
      "Only get purchases involving this project made by the client making this request.  This does not get purchases by other collaborators in this project.",
    ).nullish(),
    group: z
      .boolean()
      .describe(
        `If \`true\`, results are groups by service and project id, and then decreasingly
         ordered by cost. Otherwise, results are ordered by time, with the newest
         purchases returned first.`,
      )
      .nullish(),
    cutoff: z
      .union([z.string(), z.number()])
      .describe(
        `When provided, only purchases which occur _after_ the timestamp specified in this
         field will be returned.`,
      )
      .nullish(),
    thisMonth: z
      .boolean()
      .describe(
        "If `true`, only purchases since the most recent closing date will be returned.",
      )
      .nullish(),
    day_statement_id: DayStatementIdSchema.describe(
      "Daily statement id of the statement that includes this purchase",
    ).nullish(),
    month_statement_id: MonthStatementIdSchema.describe(
      "Monthly statement id of the statement that includes this purchase",
    ).nullish(),
    no_statement: z
      .boolean()
      .describe(
        `If \`true\`, only purchases which are
         _not_ associated with a monthly or daily statement are returned.`,
      )
      .nullish(),
  })
  .describe("Gets user purchases.");

export const GetPurchasesOutputSchema = z.union([
  FailedAPIOperationSchema,
  z
    .object({
      balance: MoneyValueSchema
        .describe(
          `The account balance after this purchase was made.  For in progress PAYG purchases, e.g., compute servers, this can be complicated -- it's the balance when the purchases table was requested, incorporating the contribution of this purchase so far.`,
        ),
      purchases: z.array(
        z.object({
          id: PurchaseIdSchema,
          time: z.string().describe("Time at which this purchase was logged."),
          cost: MoneyValueSchema.describe(
            `The cost in US dollars. Not set if the purchase isn't finished, e.g., when
         upgrading a project this is only set when project stops or purchase is finalized.
         This takes precedence over the \`cost_per_hour\` times the length of the period
         when active.`,
          ),
          period_start: z.string().describe(
            `When the purchase starts being active (e.g., a 1 week license starts and ends on
         specific days; for metered purchases it is when the purchased started charging) `,
          ),
          period_end: z.string().describe(
            `When the purchase stops being active. For metered purchases, it's when the
         purchase finished being charged, in which case the cost field should be equal to
         the length of the period times the \`cost_per_hour\`.`,
          ),
          cost_per_hour: MoneyValueSchema.describe(
            `The cost in US dollars per hour. This is used to compute the cost so far for
         metered purchases when the cost field isn't set yet. The cost so far is the
         number of hours since \`period_start\` times the \`cost_per_hour\`. The
         description field may also contain redundant cost per hour information, but this
         \`cost_per_hour\` field is the definitive source of truth. Once the \`cost\`
         field is set, this \`cost_per_hour\` is just useful for display purposes.`,
          ),
          cost_so_far: MoneyValueSchema.describe(
            `The cost so far in US dollars for a metered purchase that accumulates. This is
         used, e.g., for data transfer charges.`,
          ),
          service: PurchaseServiceSchema,
          description: z.map(z.string(), z.any()).describe(
            `An object that provides additional details about what was purchased and can have
         an arbitrary format. This is mainly used to provide extra insight when rendering
         this purchase for users, and its content should not be relied on for queries.`,
          ),
          invoice_id: InvoiceIdSchema.nullable().describe(
            `The id of the Stripe invoice that was sent that included this item. May be
           null. **Legacy Behavior:** if paid via a payment intent, this will be the id of
           a payment intent instead, and it will start with \`pi_\`.`,
          ),
          project_id: ProjectIdSchema.nullable().describe(
            `The id of the project where this purchase happened. Not all purchases
         necessarily involve a project, and so this field may be null.`,
          ),
          pending: z
            .boolean()
            .nullable()
            .describe(
              `If \`true\`, then this transaction is considered pending, which means that
            for a few days it doesn't count against the user's quotas for the purposes of
            deciding whether or not a purchase is allowed. This is needed so we can charge
            a user for their subscriptions, then collect the money from them, without all
            of the running pay-as-you-go project upgrades suddenly breaking (etc.).`,
            ),
          note: z
            .string()
            .nullable()
            .describe(
              `Non-private notes about this purchase. The user has read-only access to this
           field.`,
            ),
        }),
      ),
    })
    .describe(
      `An array of purchases filtered and/or grouped according to the provided request
       body.`,
    ),
]);

export type GetPurchasesInput = z.infer<typeof GetPurchasesInputSchema>;
export type GetPurchasesOutput = z.infer<typeof GetPurchasesOutputSchema>;
