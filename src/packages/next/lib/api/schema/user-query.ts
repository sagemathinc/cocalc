import { z } from "../framework";

import { FailedAPIOperationSchema } from "./common";
import { AccountIdSchema } from "./accounts/common";
import { ProjectIdSchema } from "./projects/common";

const ExampleUserQuerySchema = z.object({
  accounts: z
    .object({
      account_id: AccountIdSchema.nullable(),
      email_address: z.string().nullable(),
    })
    .describe(
      `Used to query for the account id and e-mail address of the account corresponding to 
       the API key provided in this request.`,
    ),
});

const ExampleDirectoryListingSchema = z.object({
  listings: z
    .object({
      project_id: ProjectIdSchema,
      path: z
        .string()
        .nullable()
        .describe("Path relative to user's `$HOME` directory."),
      listing: z
        .union([
          z.null(),
          z.array(
            z.object({
              name: z.string().describe("File name."),
              size: z.number().min(0).describe("File size."),
              mtime: z
                .number()
                .describe("Time at which the file was last modified."),
            }),
          ),
        ])
        .describe(
          "This field should be `null` when querying for a list of files.",
        ),
    })
    .describe(
      "Object containing project id and file path for which to list files.",
    ),
});

const GenericUserQuerySchema = z.any();

// OpenAPI spec
//
export const UserQueryInputSchema = z
  .object({
    query: z.union([
      ExampleUserQuerySchema,
      ExampleDirectoryListingSchema,
      GenericUserQuerySchema.describe(
        `Many other generic queries are supported; you can learn more about this endpoint 
        by viewing the corresponding CoCalc source code at 
        https://github.com/sagemathinc/cocalc/blob/master/src/packages/next/pages/api/v2/user-query.ts.`,
      ),
    ]),
  })
  .describe(
    `Used to fetch or set data corresponding to a particular account. Generally speaking, 
     when \`null\` values are provided for a specific field, this endpoint acts as a 
     getter; otherwise, it acts as a setter for the provided fields.`,
  );

export const UserQueryOutputSchema = z.union([
  FailedAPIOperationSchema,
  z.object({
    query: z.union([
      ExampleUserQuerySchema.describe(
        `An example response for an e-mail address and account id query.`,
      ),
      ExampleDirectoryListingSchema.describe(
        "An example response for a directory listing query.",
      ),
      GenericUserQuerySchema.describe(
        `Generally, the object returned from this request mimics the structure of the 
        input query with fields populated as applicable. For more information on this 
        request, check out the corresponding CoCalc source code at
        https://github.com/sagemathinc/cocalc/blob/master/src/packages/next/pages/api/v2/user-query.ts.`,
      ),
    ]),
  }),
]);

export type UserQueryInput = z.infer<typeof UserQueryInputSchema>;
export type UserQueryOutput = z.infer<typeof UserQueryOutputSchema>;
