/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Tag } from "antd";
import { join } from "path";

import basePath from "@cocalc/backend/base-path";
import { COLORS } from "@cocalc/util/theme";
import Info from "components/landing/info";
import { Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import { useCustomize } from "lib/customize";
import ComputeServerInfographic from "public/features/cocalc-compute-infographic-20231124.jpg";
import { LANDING_HEADER_LEVEL } from "./constants";

export default function ComputeServers() {
  const { computeServersEnabled, siteName } = useCustomize();
  if (!computeServersEnabled) {
    // note frontend also makes the constraint that at least one cloud is enabled.
    // see: packages/frontend/compute/config.ts
    return null;
  }
  return (
    <Info
      level={LANDING_HEADER_LEVEL}
      title={
        <>
          Dedicated Compute Servers with GPU support{" "}
          <sup>
            <Tag color={COLORS.ANTD_GREEN}>new</Tag>
          </sup>
        </>
      }
      icon="servers"
      image={ComputeServerInfographic}
      narrow={true}
      anchor="a-compute"
      alt={
        "Infographic showing how you connect from CoCalc to other machines for various tasks."
      }
      style={{ backgroundColor: COLORS.YELL_LLL }}
    >
      <Paragraph>
        Extend your {siteName} projects with powerful{" "}
        <Text strong>compute servers</Text>. They give you much more power, GPU
        support, and flexibility for your computations.
      </Paragraph>
      <Paragraph>
        From within your {siteName} project, spin up and connect to a powerful
        machine. You simply{" "}
        <Text strong>
          tell your terminals and Jupyter Notebooks to run on these machines
        </Text>
        . These compute servers open up new possibilities by utilizing enhanced
        computing resources, extending far beyond the bounds of what you can do
        in your local project.
      </Paragraph>
      <Paragraph>
        These machines optionally come with <Text strong>GPU support</Text>. The
        pre-configured software environments make it very easy to make use of
        them, right out of the box. These software environments include
        SageMath, Google Colab, Julia, PyTorch, Tensorflow and CUDA Toolkit,
        accommodating a versatile range of applications.
      </Paragraph>
      <Paragraph>
        Your <Text strong>files are synchronized</Text> on demand. Therefore,
        you can almost seamlessly switch between local and remote computing. You
        also have much more temporary storage right there on the remote machine.
      </Paragraph>
      <Paragraph>
        Usage of these machines is <Text strong>billed by the second</Text>. The
        pricing is highly competitive, starting at{" "}
        <b>
          <i>under $0.15/hour for computer servers with a GPU</i>
        </b>
        !
      </Paragraph>
      <Paragraph>
        <A href="https://doc.cocalc.com/compute_server.html">Read the docs</A>{" "}
        and{" "}
        <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/README.md">
          check out some applications
        </A>
        .
      </Paragraph>
      <Paragraph>
        <Button
          onClick={() =>
            (window.location.href = join(basePath, "/features/compute-server"))
          }
        >
          More about compute servers on {siteName}
        </Button>
      </Paragraph>
    </Info>
  );
}
