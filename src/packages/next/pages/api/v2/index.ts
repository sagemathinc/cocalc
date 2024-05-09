import { docsApiRoute } from "next-rest-framework";
import basePath from "lib/base-path";
import { join } from "path";

export default docsApiRoute({
  // deniedPaths: [...] // Ignore endpoints from the generated OpenAPI spec.
  // allowedPaths: [...], // Explicitly set which endpoints to include in the generated OpenAPI spec.
  openApiObject: {
    info: {
      title: "CoCalc API",
      version: "1.0.0",
      description: "This is the CoCalc API.",
    },
  },
  openApiJsonPath: join(basePath, "openapi.json"),
  docsConfig: {
    provider: "redoc", // redoc | swagger-ui
    title: "CoCalc API",
    description: "This is the CoCalc API.",
    logoUrl: "https://cocalc.com/_next/static/media/full.0a70e50d.svg",
  },
});
