import { authFirstRequireAccount, authFirst } from "./util";
import type {
  Action,
  Cloud,
  ComputeServerTemplate,
  ComputeServerUserInfo,
  Configuration,
  Images,
  GoogleCloudImages,
} from "@cocalc/util/db-schema/compute-servers";
import type { GoogleCloudData } from "@cocalc/util/compute/cloud/google-cloud/compute-cost";
import type { HyperstackPriceData } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import type {
  ConfigurationTemplate,
  ConfigurationTemplates,
} from "@cocalc/util/compute/templates";

export const compute = {
  createServer: authFirstRequireAccount,
  computeServerAction: authFirstRequireAccount,
  getServersById: authFirstRequireAccount,
  getServers: authFirstRequireAccount,
  getServerState: authFirstRequireAccount,
  getSerialPortOutput: authFirstRequireAccount,
  deleteServer: authFirstRequireAccount,
  undeleteServer: authFirstRequireAccount,
  isDnsAvailable: authFirstRequireAccount,
  setServerColor: authFirstRequireAccount,
  setServerTitle: authFirstRequireAccount,
  setServerConfiguration: authFirstRequireAccount,
  setTemplate: authFirstRequireAccount,
  getTemplate: true,
  getTemplates: authFirstRequireAccount,
  setServerCloud: authFirstRequireAccount,
  setServerOwner: authFirstRequireAccount,
  getGoogleCloudPriceData: authFirstRequireAccount,
  getHyperstackPriceData: authFirstRequireAccount,
  getNetworkUsage: authFirstRequireAccount,
  getApiKey: authFirstRequireAccount,
  deleteApiKey: authFirstRequireAccount,
  getLog: authFirstRequireAccount,
  getTitle: authFirstRequireAccount,
  setDetailedState: authFirstRequireAccount,
  getImages: authFirst,
  getGoogleCloudImages: authFirst,
  setImageTested: authFirstRequireAccount,
};

export interface Compute {
  // server lifecycle
  createServer: (opts: {
    account_id?: string;
    project_id: string;
    title?: string;
    color?: string;
    autorestart?: boolean;
    cloud?: Cloud;
    configuration?: Configuration;
    notes?: string;
    course_project_id?: string;
    course_server_id?: number;
  }) => Promise<number>;

  computeServerAction: (opts: {
    account_id?: string;
    id: number;
    action: Action;
  }) => Promise<void>;

  getServersById: (opts: {
    account_id?: string;
    ids: number[];
    fields?: Array<keyof ComputeServerUserInfo>;
  }) => Promise<Partial<ComputeServerUserInfo>[]>;

  getServers: (opts: {
    account_id?: string;
    id?: number;
    project_id: string;
  }) => Promise<ComputeServerUserInfo[]>;

  getServerState: (opts: {
    account_id?: string;
    id: number;
  }) => Promise<ComputeServerUserInfo["state"]>;
  getSerialPortOutput: (opts: {
    account_id?: string;
    id: number;
  }) => Promise<string>;

  deleteServer: (opts: { account_id?: string; id: number }) => Promise<void>;
  undeleteServer: (opts: { account_id?: string; id: number }) => Promise<void>;

  isDnsAvailable: (opts: {
    account_id?: string;
    dns: string;
  }) => Promise<boolean>;

  // ownership & metadata
  setServerColor: (opts: {
    account_id?: string;
    id: number;
    color: string;
  }) => Promise<void>;
  setServerTitle: (opts: {
    account_id?: string;
    id: number;
    title: string;
  }) => Promise<void>;
  setServerConfiguration: (opts: {
    account_id?: string;
    id: number;
    configuration: Partial<Configuration>;
  }) => Promise<void>;

  setTemplate: (opts: {
    account_id?: string;
    id: number;
    template: ComputeServerTemplate;
  }) => Promise<void>;

  getTemplate: (opts: {
    account_id?: string;
    id: number;
  }) => Promise<ConfigurationTemplate>;
  getTemplates: () => Promise<ConfigurationTemplates>;

  setServerCloud: (opts: {
    account_id?: string;
    id: number;
    cloud: Cloud | string;
  }) => Promise<void>;
  setServerOwner: (opts: {
    account_id?: string;
    id: number;
    new_account_id: string;
  }) => Promise<void>;

  // pricing caches
  getGoogleCloudPriceData: () => Promise<GoogleCloudData>;
  getHyperstackPriceData: () => Promise<HyperstackPriceData>;

  // usage & logs
  getNetworkUsage: (opts: {
    account_id?: string;
    id: number;
    start: Date;
    end: Date;
  }) => Promise<{ amount: number; cost: number }>;

  getApiKey: (opts: { account_id?: string; id: number }) => Promise<string>;
  deleteApiKey: (opts: { account_id?: string; id: number }) => Promise<void>;

  getLog: (opts: {
    account_id?: string;
    id: number;
    type: "activity" | "files";
  }) => Promise<any>;

  getTitle: (opts: { account_id?: string; id: number }) => Promise<{
    title: string;
    color: string;
    project_specific_id: number;
  }>;

  setDetailedState: (opts: {
    account_id?: string;
    project_id: string;
    id: number;
    name: string;
    state?: string;
    extra?: string;
    timeout?: number;
    progress?: number;
  }) => Promise<void>;

  getImages: (opts?: {
    noCache?: boolean;
    account_id?: string;
  }) => Promise<Images>;
  getGoogleCloudImages: (opts?: {
    noCache?: boolean;
    account_id?: string;
  }) => Promise<GoogleCloudImages>;
  setImageTested: (opts: {
    account_id?: string;
    id: number;
    tested: boolean;
  }) => Promise<void>;
}
