import { z } from "../../../framework";

import { FailedAPIOperationSchema, OkAPIOperationSchema } from "../../common";
import {
  ProductDescription,
  ProductType,
} from "@cocalc/util/db-schema/shopping-cart-items";

// OpenAPI spec
//
export const ShoppingCartAddInputSchema = z
  .object({
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
      .enum(["cash-voucher", "membership"])
      .describe(
        "Product type to purchase. Must be populated if the `id` field is empty.",
      )
      .nullish(),
    description: z
      .union([
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
            class: z.string().min(1),
            interval: z.enum(["month", "year"]),
            price: z.number().min(0).optional(),
          })
          .describe("Membership subscription."),
      ])
      .describe(
        `This field is used to specify details appropriate to the product being purchased.
         For cash vouchers, this includes the voucher amount and metadata for redemption.`,
      )
      .nullish(),
    purchased: z.boolean().nullish(),
  })
  .describe("Adds an item to the shopping cart.");

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
