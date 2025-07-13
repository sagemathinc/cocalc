import * as fs from "fs";
import * as https from "https";

// Define the options interface for type safety
interface ListPodsOptions {
  labelSelector?: string; // e.g. "app=foo,env=prod"
}

const NAMESPACE: string = fs
  .readFileSync(
    "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
    "utf8",
  )
  .trim();
const CA: Buffer = fs.readFileSync(
  "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
);

async function listPods(options: ListPodsOptions = {}): Promise<any> {
  try {
    // Read service account details, token could be rotated
    const token = fs
      .readFileSync(
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
        "utf8",
      )
      .trim();

    // Base API path
    let path = `/api/v1/namespaces/${NAMESPACE}/pods`;

    const queryParams: string[] = [];
    if (options.labelSelector) {
      queryParams.push(
        `labelSelector=${encodeURIComponent(options.labelSelector)}`,
      );
    }

    if (queryParams.length > 0) {
      path += `?${queryParams.join("&")}`;
    }

    const query: https.RequestOptions = {
      hostname: "kubernetes.default.svc",
      path,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      ca: [CA],
    };

    return new Promise((resolve, reject) => {
      const req = https.request(query, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `K8S API request failed. status=${res.statusCode}: ${data}`,
              ),
            );
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(parseError);
            }
          }
        });
      });

      req.on("error", (error) => reject(error));
      req.end();
    });
  } catch (error) {
    throw new Error(
      `Failed to read service account files: ${(error as Error).message}`,
    );
  }
}

export async function getAddressesFromK8sApi(): Promise<
  { name: string; podIP: string }[]
> {
  const res = await listPods({ labelSelector: "run=hub-conat-router" });
  const ret: { name: string; podIP: string }[] = [];
  for (const pod of res.items) {
    const name = pod.metadata?.name;
    const podIP = pod.status?.podIP;
    if (name && podIP) {
      ret.push({ name, podIP });
    }
  }
  return ret;
}
