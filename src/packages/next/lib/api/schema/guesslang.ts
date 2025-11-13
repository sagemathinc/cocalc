import { z } from "../framework";

import { FailedAPIOperationSchema } from "./common";

// OpenAPI spec
//
export const GuesslangInputSchema = z
  .object({
    code: z.string().describe("A snippet of code."),
    cutoff: z
      .number()
      .positive()
      .default(5)
      .describe("Maximum number of results to return."),
  })
  .describe(
    `Use a sophisticated machine learning model (see 
    \`@vscode/vscode-languagedetection\`) to guess the language of a snippet of 
    code.`,
  );

export const GuesslangOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    result: z
      .array(z.string())
      .describe(
        `List of likely guesses for the type of code, from most likely to least 
        likely.`,
      ),
  }),
]);

export type GuesslangInput = z.infer<typeof GuesslangInputSchema>;
export type GuesslangOutput = z.infer<typeof GuesslangOutputSchema>;
