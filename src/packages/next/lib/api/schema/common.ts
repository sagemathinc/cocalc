import { z } from "../framework";

export const SuccessfulAPIOperationSchema = z
  .object({
    status: z.enum(["ok"])
      .describe(
        `Indicates the status of this operation; if the operation was successful, the 
        value of this field is always set to \`"ok"\`.`
      )
  });

export const FailedAPIOperationSchema = z
  .object({
    error: z
      .string()
      .describe("Error message if something goes badly wrong."),
  });


export type FailedAPIOperation = z.infer<typeof FailedAPIOperationSchema>;
export type SuccessfulAPIOperation = z.infer<typeof SuccessfulAPIOperationSchema>;
