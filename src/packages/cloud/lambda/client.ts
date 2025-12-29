import axios, { type AxiosInstance } from "axios";

const BASE_URL = "https://cloud.lambda.ai";

export type LambdaClientOptions = {
  apiKey: string;
};

export class LambdaClient {
  private http: AxiosInstance;

  constructor(opts: LambdaClientOptions) {
    this.http = axios.create({
      baseURL: BASE_URL,
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      timeout: 30000,
    });
  }

  listInstanceTypes() {
    return this.http.get("/api/v1/instance-types").then((r) => r.data.data);
  }

  listImages() {
    return this.http.get("/api/v1/images").then((r) => r.data.data);
  }

  listSshKeys() {
    return this.http.get("/api/v1/ssh-keys").then((r) => r.data.data);
  }

  createSshKey(name: string, public_key: string) {
    return this.http
      .post("/api/v1/ssh-keys", { name, public_key })
      .then((r) => r.data.data);
  }

  deleteSshKey(id: string) {
    return this.http
      .delete(`/api/v1/ssh-keys/${id}`)
      .then((r) => r.data.data);
  }

  listFilesystems() {
    return this.http.get("/api/v1/file-systems").then((r) => r.data.data);
  }

  createFilesystem(name: string, region: string) {
    return this.http
      .post("/api/v1/filesystems", { name, region })
      .then((r) => r.data.data);
  }

  listInstances() {
    return this.http.get("/api/v1/instances").then((r) => r.data.data);
  }

  getInstance(id: string) {
    return this.http.get(`/api/v1/instances/${id}`).then((r) => r.data.data);
  }

  launchInstance(payload: any) {
    return this.http
      .post("/api/v1/instance-operations/launch", payload)
      .then((r) => r.data.data);
  }

  restartInstance(instance_ids: string[]) {
    return this.http
      .post("/api/v1/instance-operations/restart", { instance_ids })
      .then((r) => r.data.data);
  }

  terminateInstance(instance_ids: string[]) {
    return this.http
      .post("/api/v1/instance-operations/terminate", { instance_ids })
      .then((r) => r.data.data);
  }
}
