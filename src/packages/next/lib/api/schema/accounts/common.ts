import { z } from "../../framework";

export const AccountIdSchema = z
  .string()
  .uuid()
  .describe("Account id.");

export type AccountId = z.infer<typeof AccountIdSchema>;
