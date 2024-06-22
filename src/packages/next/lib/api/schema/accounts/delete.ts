import { z } from "../../framework";

import {
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
} from "../common";

// OpenAPI spec
//
export const DeleteAccountOutputSchema = z.union([
  FailedAPIOperationSchema,
  SuccessfulAPIOperationSchema,
]);

export type DeleteAccountOutput = z.infer<typeof DeleteAccountOutputSchema>;
