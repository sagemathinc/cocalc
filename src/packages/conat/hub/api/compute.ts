import { authFirstRequireAccount } from "./util";
import type {
  //Action,
  Cloud,
  //ComputeServerTemplate,
  //ComputeServerUserInfo,
  Configuration,
  //Images,
  //GoogleCloudImages,
} from "@cocalc/util/db-schema/compute-servers";

export const compute = {
  createServer: authFirstRequireAccount,
};

export interface Compute {
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
}
