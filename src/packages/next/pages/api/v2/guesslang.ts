import { ModelOperations } from "@vscode/vscode-languagedetection";
import getParams from "lib/api/get-params";

const modelOperations = new ModelOperations();

async function handle(req, res) {
  const { code, cutoff = 5 } = getParams(req);
  try {
    const result = (await modelOperations.runModel(code))
      .slice(0, parseInt(cutoff))
      .map((x) => x.languageId);
    res.json({ result });
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
  }
}

//** OpenAPI below **

import { z } from "zod";
import { apiRoute, apiRouteOperation } from "next-rest-framework";

const querySchema = z
  .object({
    code: z.string().describe("A snippet of code."),
    cutoff: z
      .number()
      .positive()
      .default(5)
      .describe("Maximum number of results to return."),
  })
  .describe(
    "Use a sophisticated machine learning model (see @vscode/vscode-languagedetection) to guess the language of a snippet of code.",
  );

export default apiRoute({
  guesslang: apiRouteOperation({
    method: "POST",
  })
    .input({ contentType: "application/json", body: querySchema })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: z.union([
          z.object({
            error: z
              .string()
              .optional()
              .describe("Error message is something goes badly wrong."),
          }),
          z.object({
            result: z
              .array(z.string())
              .describe(
                "List of likely guesses for the type of code, from most likely to less likely.",
              ),
          }),
        ]),
      },
    ])
    .handler(handle),
});
