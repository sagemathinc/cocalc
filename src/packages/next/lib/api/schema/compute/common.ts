import { z } from "../../framework";

export const ComputeServerIdSchema = z
  .number()
  .int()
  .min(0)
  .describe("Compute server id (or 0 for your home base)");

export const ComputeServerStateSchema = z
  .enum([
    "deprovisioned",
    "off",
    "running",
    "starting",
    "stopping",
    "suspended",
    "suspending",
    "unknown",
  ])
  .describe("The state of the compute server.");

export const ComputeServerColorSchema = z.string().describe(
  `Compute server color in \`rgb(#,#,#)\` format. Used for color-coding compute servers in
    the CoCalc UI.`,
);

export const ComputeServerTitleSchema = z.string().describe(
  `Title of this compute server. Used purely to make it easier for the user to keep
    track of it.`,
);

export const ComputeServerCloudSchema = z
  .enum(["google-cloud", "hyperstack", "onprem"])
  .describe("The cloud provider used to run this compute server");

export const ComputeServerImageProxySchema = z.object({
  path: z.string(),
  target: z.string(),
  ws: z.boolean().optional(),
  app: z.string().optional(),
  name: z.string().optional(),
});

export const GoogleCloudServerConfigurationSchema = z.object({}).passthrough();

export const HyperstackServerConfigurationSchema = z.object({}).passthrough();

export const ServerConfigurationSchema = z.union([
  GoogleCloudServerConfigurationSchema,
  HyperstackServerConfigurationSchema,
]);

export const BaseServerConfigurationSchema = z.object({
  cloud: ComputeServerCloudSchema,
  dns: z.string().describe("DNS name"),
  spot: z.boolean().describe("If true, provision a spot instance."),
  zone: z
    .string()
    .describe("Cloud provider zone to which this template defaults."),
  image: z.string().describe("Compute server template image name."),
  region: z.string().describe("Compute server template region name."),
  ephemeral: z
    .boolean()
    .describe("Indicates whether the compute server is ephemeral.")
    .optional(),
  diskType: z.string().describe("Compute server template disk type."),
  diskSizeGb: z
    .number()
    .min(0)
    .describe("Compute server template disk image size in GB."),
  externalIp: z
    .boolean()
    .describe(
      `When true, the compute server is configured with an external IP address.`,
    ),
  tag_cocalc: z.string().describe("CoCalc tag"),
  machineType: z
    .string()
    .describe(
      "Cloud-specific machine type for this template (e.g., `t2d-standard-1`).",
    ),
  excludeFromSync: z
    .array(z.string())
    .describe("Array of top level directories to exclude from sync."),
  acceleratorType: z
    .string()
    .describe(
      "Number of hardware accelerators to be provisioned to this server.",
    )
    .optional(),
  acceleratorCount: z
    .number()
    .int()
    .min(0)
    .describe(
      "Number of hardware accelerators to be provisioned with this server.",
    )
    .optional(),
  proxy: ComputeServerImageProxySchema.optional(),
});

export type BaseServerConfiguration = z.infer<
  typeof BaseServerConfigurationSchema
>;
export type ComputeServerBodyId = z.infer<typeof ComputeServerIdSchema>;
export type ComputeServerCloud = z.infer<typeof ComputeServerCloudSchema>;
export type ComputeServerColor = z.infer<typeof ComputeServerColorSchema>;
export type ComputeServerImageProxy = z.infer<
  typeof ComputeServerImageProxySchema
>;
export type ComputeServerState = z.infer<typeof ComputeServerStateSchema>;
export type ComputeServerTitle = z.infer<typeof ComputeServerTitleSchema>;
export type GoogleCloudServerConfiguration = z.infer<
  typeof GoogleCloudServerConfigurationSchema
>;
export type HyperstackServerConfiguration = z.infer<
  typeof HyperstackServerConfigurationSchema
>;
export type ServerConfiguration = z.infer<typeof ServerConfigurationSchema>;
