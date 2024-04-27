import type {
  Cloud,
  Configuration,
  ComputeServerTemplate,
} from "@cocalc/util/db-schema/compute-servers";

export interface ConfigurationTemplate {
  title: string;
  color: string;
  cloud: Cloud;
  configuration: Configuration;
  template: ComputeServerTemplate;
  avatar_image_tiny?: string;
  cost_per_hour: { running: number; off: number };
}
