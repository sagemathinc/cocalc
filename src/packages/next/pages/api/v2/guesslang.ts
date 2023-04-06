import { ModelOperations } from "@vscode/vscode-languagedetection";
import getParams from "lib/api/get-params";

const modelOperations = new ModelOperations();

export default async function handle(req, res) {
  const { code, cutoff = 5 } = getParams(req, { allowGet: true });
  try {
    const result = (await modelOperations.runModel(code))
      .slice(0, cutoff)
      .map((x) => x.languageId);
    res.json({ result });
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
  }
}
