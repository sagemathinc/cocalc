import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";

import { ProjectIdSchema } from "../../projects/common";

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
        z
          .object({
            title: LicenseTitleSchema,
            description: LicenseDescriptionSchema,
            range: LicenseRangeSchema,
            period: z.enum(["range", "monthly", "yearly"]).describe(
              `Period for which this license is to be applied. If \`range\` is selected, 
               the \`range\` field must be populated in this request.`,
            ),
            type: z.enum(["quota"]).describe("License type"),
            user: z.enum(["academic", "business"]).describe("User type."),
            run_limit: z
              .number()
              .min(0)
              .describe(
                "Number of projects which may simultaneously use this license",
              ),
            always_running: z
              .boolean()
              .nullish()
              .describe(
                `Indicates whether the project(s) this license is applied to should be 
                 allowed to always be running.`,
              ),
            ram: z
              .number()
              .min(1)
              .describe(
                "Limits the total memory a project can use. At least 2GB is recommended.",
              ),
            cpu: z
              .number()
              .min(1)
              .describe(
                "Limits the total number of vCPUs allocated to a project.",
              ),
            disk: z
              .number()
              .min(1)
              .describe(
                `Disk size in GB to be allocated to the project to which this license is 
                 applied.`,
              ),
            member: z.boolean().describe(
              `Member hosting significantly reduces competition for resources, and we 
               prioritize support requests much higher. _Please be aware: licenses of 
               different member hosting service levels cannot be combined!_`,
            ),
            uptime: z
              .enum(["short", "medium", "day", "always_running"])
              .describe(
                `Determines how long a project runs while not being used before being 
                 automatically stopped. A \`short\` value corresponds to a 30-minute 
                 timeout, and a \`medium\` value to a 2-hour timeout.`,
              ),
            boost: z
              .boolean()
              .nullish()
              .describe(
                `If \`true\`, this license is a boost license and allows for a project to
                 temporarily boost the amount of resources available to a project by the
                 amount specified in the \`cpu\`, \`memory\`, and \`disk\` fields.`,
              ),
          })
          .describe("Project resource quote license."),
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
      ),
    purchased: z.boolean().nullish(),
  })
  .describe("Adds a license to the shopping cart.");

export const ShoppingCartAddOutputSchema = z.union([
  FailedAPIOperationSchema,
  OkAPIOperationSchema,
]);

export type ShoppingCartAddInput = z.infer<typeof ShoppingCartAddInputSchema>;
export type ShoppingCartAddOutput = z.infer<typeof ShoppingCartAddOutputSchema>;
