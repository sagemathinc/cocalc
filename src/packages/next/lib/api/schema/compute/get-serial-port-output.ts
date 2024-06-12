import { z } from "../../framework";

import { FailedAPIOperationSchema } from "../common";
import { ComputeServerIdSchema } from "./common";

// OpenAPI spec
//
export const GetComputeServerSerialPortOutputInputSchema = z
  .object({
    id: ComputeServerIdSchema,
  })
  .describe("Get serial port output for a compute server.");

export const GetComputeServerSerialPortOutputOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.string().describe("Serial port output for the compute server."),
]);

export type GetComputeServerSerialPortOutputInput = z.infer<
  typeof GetComputeServerSerialPortOutputInputSchema
>;
export type GetComputeServerSerialPortOutputOutput = z.infer<
  typeof GetComputeServerSerialPortOutputOutputSchema
>;
