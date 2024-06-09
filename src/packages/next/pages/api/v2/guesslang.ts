import { ModelOperations } from "@vscode/vscode-languagedetection";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GuesslangInputSchema,
  GuesslangOutputSchema
} from "lib/api/schema/guesslang";

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

export default apiRoute({
  guesslang: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Utils"]
    },
  })
    .input({
      contentType: "application/json",
      body: GuesslangInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GuesslangOutputSchema,
      },
    ])
    .handler(handle),
});
