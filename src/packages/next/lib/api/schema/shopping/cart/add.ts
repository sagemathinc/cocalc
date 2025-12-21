import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";
import {
  ProductDescription,
  ProductType,
} from "@cocalc/util/db-schema/shopping-cart-items";

import { ProjectIdSchema } from "../../projects/common";
import {
  SiteLicenseQuotaSchema,
  SiteLicenseRunLimitSchema,
  SiteLicenseUptimeSchema,
} from "../../licenses/common";

const LicenseRangeSchema = z.tuple([z.string(), z.string()]).describe(
  `Array of two ISO 8601-formatted timestamps. The first element indicates the start
     date of the license, and the second indicates the end date. Used when the \`period\`
     field is set to \`range\`.`,
);

const LicenseTitleSchema = z
  .string()
  .describe("Semantic license title.")
  .optional();

const LicenseDescriptionSchema = z
  .string()
  .describe("Semantic license description")
  .optional();

// OpenAPI spec
//
export const ShoppingCartAddInputSchema = z
  .object({
    project_id: ProjectIdSchema.nullish().describe(
      "If specified, this license is automatically added to an existing project.",
    ),
    id: z
      .number()
      .min(0)
      .describe(
        `Existing shopping cart item id. If \`purchased\` is true, this puts a new copy
         of the purchased item in the cart. Otherwise, this adds an item to the cart that
         was saved for later. If this parameter is not specified, the \`product\` field
         must be populated.`,
      )
      .nullish(),
    product: z
      .enum(["site-license", "cash-voucher", "membership"])
      .describe(
        "Product type to purchase. Must be populated if the `id` field is empty.",
      )
      .nullish(),
    description: z
      .union([
        SiteLicenseQuotaSchema.extend({
          title: LicenseTitleSchema.optional(),
          description: LicenseDescriptionSchema.optional(),
          range: LicenseRangeSchema.optional(),
          period: z.enum(["range", "monthly", "yearly"]).describe(
            `Period for which this license is to be applied. If \`range\` is selected,
               the \`range\` field must be populated in this request.`,
          ),
          type: z.enum(["quota"]).describe("License type"),
          run_limit: SiteLicenseRunLimitSchema,
          uptime: SiteLicenseUptimeSchema,
        }).describe("Project resource quota license."),
        z
          .object({
            type: z.enum(["cash-voucher"]),
            amount: z.number().min(0.01),
            numVouchers: z.number().min(1),
            whenPay: z.enum(["now", "admin"]),
            length: z.number().min(1),
            title: z.string(),
            prefix: z.string(),
            postfix: z.string(),
            charset: z.string(),
            expire: z.date(),
          })
          .describe("Used to specify cash voucher."),
        z
          .object({
            type: z.enum(["membership"]),
            class: z.enum(["member", "pro"]),
            interval: z.enum(["month", "year"]),
            price: z.number().min(0).optional(),
          })
          .describe("Membership subscription."),
      ])
      .describe(
        `This field is used to specify details appropriate to the product being purchased.
         For cash vouchers, this includes the voucher amount and for licenses, this is a
         JSON object specifying license details (duration, memory, project count, etc.)`,
      )
      .nullish(),
    purchased: z.boolean().nullish(),
  })
  .describe("Adds a license to the shopping cart.");

export const ShoppingCartAddOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type ShoppingCartAddInput = z.infer<typeof ShoppingCartAddInputSchema>;
export type ShoppingCartAddOutput = z.infer<typeof ShoppingCartAddOutputSchema>;

// consistency checks
export const _1: ProductType = {} as NonNullable<
  ShoppingCartAddInput["product"]
>;
export const _2: ProductDescription = {} as NonNullable<
  ShoppingCartAddInput["description"]
>;
