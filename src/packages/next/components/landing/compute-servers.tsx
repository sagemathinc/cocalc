/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { join } from "path";
import basePath from "@cocalc/backend/base-path";
import { COLORS } from "@cocalc/util/theme";
import Info from "components/landing/info";
import { Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import { useCustomize } from "lib/customize";
import ComputeServerInfographic from "public/features/running-compute-server.png";
import { LANDING_HEADER_LEVEL } from "./constants";
import ComputeServerTemplates from "./compute-server-templates";
import { useRef } from "react";

export default function ComputeServers() {
  const { computeServersEnabled, siteName } = useCustomize();
  const ref = useRef<any>(undefined);
  if (!computeServersEnabled) {
    // note frontend also makes the constraint that at least one cloud is enabled.
    // see: packages/frontend/compute/config.ts
    return null;
  }
  return (
    <Info
      innerRef={ref}
      level={LANDING_HEADER_LEVEL}
      title={
        <>
          Powerful Compute Servers with Optional GPUs
          <ComputeServerTemplates
            getPopupContainer={() => ref.current}
            style={{ maxWidth: "900px" }}
          />
        </>
      }
      icon="servers"
      image={ComputeServerInfographic}
      narrow={true}
      anchor="a-compute"
      alt={"Compute server templates"}
      style={{
        backgroundColor: COLORS.YELL_LLL,
        // ref hook and this below is so compute server template stays in here:
        // https://github.com/sagemathinc/cocalc/issues/7511
        position: "relative",
        overflow: "hidden",
      }}
      icons={[
        { icon: "jupyter", link: "/features/jupyter-notebook" },
        {
          icon: "nvidia",
          title: "GPUs",
          link: "https://doc.cocalc.com/compute_server.html",
        },
        {
          icon: "pytorch",
          title: "PyTorch",
          link: "https://doc.cocalc.com/compute_server.html",
        },
        {
          icon: "tensorflow",
          title: "TensorFlow",
          link: "https://doc.cocalc.com/compute_server.html",
        },
        {
          icon: "vscode",
          title: "VS Code",
          link: "https://doc.cocalc.com/vscode.html",
        },
        {
          icon: "desktop",
          title: "X11 Desktop",
          link: "features/x11",
        },
        {
          icon: "terminal",
          title: "Linux Terminal",
          link: "features/terminal",
        },
        {
          icon: "julia",
          title: "Julia & Pluto",
          link: "/features/julia",
        },
      ]}
    >
      <Paragraph>
        Extend your {siteName} projects with powerful{" "}
        <Text strong>compute servers</Text>. They give you much more power, GPU
        options, and flexibility for your computations.
      </Paragraph>
      <Paragraph>
        From within your {siteName} project, spin up and connect to a powerful
        machine. You simply{" "}
        <Text strong>
          tell your terminals and Jupyter Notebooks to run on these machines
        </Text>
        , or with one click launch JupyterLab or VS Code. These compute servers
        open up new possibilities by utilizing enhanced computing resources,
        extending far beyond the bounds of what you can do in your local
        project.
      </Paragraph>
      <Paragraph>
        These servers optionally come with{" "}
        <Text strong>very competitively priced GPU support</Text>, from a single
        NVIDIA T4 to eight H100's, with many options in between, including L4
        and L40, RTX-A4/5/6000, and A100 with 40GB and 80GB. The finely
        configured software images include{" "}
        <A href="https://youtu.be/kcxyShH3wYE">Google Colab</A>, SageMath,
        Anaconda, Julia, <A href="https://youtu.be/JG6jm6yv_KE">PyTorch</A>,
        Tensorflow and <A href="https://youtu.be/OMN1af0LUcA">Open WebUI</A>,
        accommodating a versatile range of uses. The pre-configured software
        environments make it very easy to make use of them, right out of the
        box. You can also run any command as{" "}
        <A href="https://doc.cocalc.com/compute_server.html#becoming-root-and-port-forwarding">
          root
        </A>
        , install anything you want, and use Docker and Kubernetes.
      </Paragraph>
      <Paragraph>
        Your{" "}
        <A href="https://doc.cocalc.com/compute_server.html#compute-server-filesystem">
          <Text strong>files are synchronized</Text>
        </A>
        . Therefore, you can seamlessly switch between different servers. You
        also have much more disk storage on the remote machine.
      </Paragraph>
      <Paragraph>
        Usage of these machines is <Text strong>billed by the second</Text>. The
        pricing is highly competitive, starting at{" "}
        <b>
          <i>under $0.01/hour and under $0.15/hour with a GPU!</i>
        </b>
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
