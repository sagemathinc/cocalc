import * as k8s from "@kubernetes/client-node";
import { readFileSync } from "fs";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// Read the namespace the pod is running in
const namespace = readFileSync(
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace",
  "utf8",
).trim();

export async function getAddressesFromK8sApi(): Promise<
  { name: string; podIP: string }[]
> {
  try {
    const labelSelector = "run=hub-conat-router";
    const res = await k8sApi.listNamespacedPod({ namespace, labelSelector });

    const ret: { name: string; podIP: string }[] = [];
    for (const pod of res.items) {
      const name = pod.metadata?.name;
      const podIP = pod.status?.podIP;
      if (name && podIP) {
        ret.push({ name, podIP });
      }
    }
    return ret;
  } catch (err) {
    console.error("Error fetching addresses from Kubernetes API:", err);
    return [];
  }
}
