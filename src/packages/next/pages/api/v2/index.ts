import { docsApiRoute } from "next-rest-framework";
import { join } from "node:path";

import basePath from "lib/base-path";


export default docsApiRoute({
  // deniedPaths: [...] // Ignore endpoints from the generated OpenAPI spec.
  // allowedPaths: [...], // Explicitly set which endpoints to include in the generated OpenAPI spec.
  openApiObject: {
    info: {
      title: "CoCalc API",
      version: "2.0.0",
      summary: `This is the CoCalc HTTP API. To get started, you'll need to
                [create an API key](https://doc.cocalc.com/apikeys.html).`,
      description: `This is the CoCalc HTTP API. To get started, you'll need to
                [create an API key](https://doc.cocalc.com/apikeys.html).`,
    },
    externalDocs: {
      url: "https://doc.cocalc.com",
      description: "Check out the CoCalc documentation and user guide.",
    },
    components: {
      securitySchemes: {
        BasicAuth: {
          type: "http",
          scheme: "basic",
          description: `The \`password\` field should be left blank, and the \`username\`
                        field should contain the client's API key.`,
        },
      },
    },
    security: [
      {
        BasicAuth: [],
      },
    ],
    servers: [
      {
        description: "CoCalc Production",
        url: "https://cocalc.com",
        variables: {
          apiKey: {
            default: "",
            description: `API key to use for the request. An account-wide key may be
            obtained by visiting https://cocalc.com/settings/account`,
          },
        },
      },
      {
        description: "CoCalc Dev",
        url: "http://localhost:5000",
        variables: {
          apiKey: {
            default: "",
            description: `API key to use for the request. An account-wide key may be
            obtained by visiting http://localhost:5000/settings/account`,
          },
        },
      },
    ],
  },
  openApiJsonPath: join(basePath, "openapi.json"),
  docsConfig: {
    provider: "redoc", // redoc | swagger-ui
    title: "CoCalc API",
    description: "",
    logoUrl: "https://cocalc.com/_next/static/media/full.0a70e50d.svg",
    ogConfig: {
      title: "CoCalc HTTP API (v2)",
      type: "website",
      url: "https://cocalc.com/api/v2",
      imageUrl: "https://cocalc.com/webapp/favicon.ico",
    },
  },
});
