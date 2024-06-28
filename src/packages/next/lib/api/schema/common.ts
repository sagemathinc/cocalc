import { z } from "../framework";

const BasicallyAnHTTP204 = (status: string) =>
  z.object({
    status: z.enum([status]).describe(
      `Indicates the status of this operation; if the operation was successful, the 
        value of this field is always set to \`${status}\`.`,
    ),
  });

export const OkAPIOperationSchema = BasicallyAnHTTP204("ok");
export const SuccessfulAPIOperationSchema = BasicallyAnHTTP204("success");

export const FailedAPIOperationSchema = z.object({
  error: z.string().describe("Error message if something goes badly wrong."),
});

export type FailedAPIOperation = z.infer<typeof FailedAPIOperationSchema>;
export type SuccessfulAPIOperation = z.infer<
  typeof SuccessfulAPIOperationSchema
>;
export type OkAPIOperation = z.infer<typeof OkAPIOperationSchema>;

export const RequestNoCacheSchema = z
  .boolean()
  .describe(
    "**Administrators only**. Disables database caching for this query.",
  )
  .optional();

export type RequestNoCache = z.infer<typeof RequestNoCacheSchema>;
