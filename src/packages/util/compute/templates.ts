import type {
  Cloud,
  Configuration,
  ComputeServerTemplate,
  Images,
} from "@cocalc/util/db-schema/compute-servers";

export interface ConfigurationTemplate {
  id: number;
  title: string;
  color: string;
  cloud: Cloud;
  position: number;
  configuration: Configuration;
  template: ComputeServerTemplate;
  avatar_image_tiny?: string;
  cost_per_hour: { running: number; off: number };
}

export interface ConfigurationTemplates {
  // the templates
  templates: ConfigurationTemplate[];
  // extra data to enable frontend rendering of the templates -- this can be "big" -- e.g., 200kb total...
  data: {
    images: Images;
    hyperstackPriceData?;
    googleCloudPriceData?;
  };
}
