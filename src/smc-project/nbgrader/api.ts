import {
  NBGraderAPIOptions,
  NBGraderAPIResponse
} from "../smc-webapp/jupyter/nbgrader/api";

export async function nbgrader(
  client,
  logger,
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  logger.debug("nbgrader", opts);
  client = client;
  return { output: "hello world" };
}
