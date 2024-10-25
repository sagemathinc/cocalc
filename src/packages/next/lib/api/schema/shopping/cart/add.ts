import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../../projects/common";
import {
  SiteLicenseQuotaSchema,
  SiteLicenseRunLimitSchema,
  SiteLicenseUptimeSchema,
} from "../../licenses/common";

const LicenseRangeSchema = z
  .array(z.string())
  .length(2)
  .describe(
    `Array of two ISO 8601-formatted timestamps. The first element indicates the start
     date of the license, and the second indicates the end date. Used when the \`period\`
     field is set to \`range\`.`,
  );

const LicenseTitleSchema = z
  .string()
  .describe("Semantic license title.")
  .nullish();

const LicenseDescriptionSchema = z
  .string()
  .describe("Semantic license description")
  .nullish();

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
      .enum(["site-license", "cash-voucher"])
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
            title: LicenseTitleSchema,
            description: LicenseDescriptionSchema,
            range: LicenseRangeSchema,
            period: z.enum(["range"]).describe(
              `License period for the virtual machine. Note that such licenses may only
               be purchased for a particular time period as specified in the \`range\`
               field.`,
            ),
            type: z.enum(["vm"]).describe("License type"),
            dedicated_vm: z.object({
              name: z
                .string()
                .nullish()
                .describe("Virtual machine id (derived from the license id)"),
              machine: z
                .string()
                .describe(
                  "Google Cloud virtual machine type (e.g., `n2-standard-4`).",
                ),
            }),
          })
          .describe("Dedicated VM license."),
        z
          .object({
            title: LicenseTitleSchema,
            description: LicenseDescriptionSchema,
            period: z.enum(["monthly"]).describe(
              `License period for the dedicated disk. Note that such licenses may only
               be purchased on a monthly basis.`,
            ),
            type: z.enum(["disk"]).describe("License type"),
            dedicated_disk: z.union([
              z.object({
                name: z.string().nullish().describe("Dedicated disk id."),
                size_gb: z
                  .number()
                  .min(1)
                  .describe("Size of dedicated disk in GB."),
                speed: z
                  .enum(["standard", "balanced", "ssd"])
                  .describe("Desired disk speed."),
              }),
              z
                .boolean()
                .describe(
                  "If a boolean value is provided, it must be set to `false`.",
                ),
            ]),
          })
          .describe("Dedicated disk license."),
        z
          .object({
            type: z.enum(["cash-voucher"]),
            amount: z.number().min(0),
          })
          .describe("Used to specify cash voucher amount."),
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
