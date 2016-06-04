#!/bin/bash

# Actually re-written by William Stein, 2016, for SMC...

# Copyright 2014 The Kubernetes Authors All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Bring up a Kubernetes cluster.
#
# If the full release name (gs://<bucket>/<release>) is passed in then we take
# that directly.  If not then we assume we are doing development stuff and take
# the defaults in the release config.

set -o errexit
set -o nounset
set -o pipefail

if [ -f "${KUBE_ROOT}/cluster/env.sh" ]; then
    source "${KUBE_ROOT}/cluster/env.sh"
fi

source "${KUBE_ROOT}/cluster/kube-util.sh"


if [ -z "${ZONE-}" ]; then
  echo "... Starting cluster using provider: ${KUBERNETES_PROVIDER}" >&2
else
  echo "... Starting cluster in ${ZONE} using provider ${KUBERNETES_PROVIDER}" >&2
fi

echo "... calling verify-prereqs" >&2
verify-prereqs

if [[ "${KUBE_STAGE_IMAGES:-}" == "true" ]]; then
  echo "... staging images" >&2
  stage-images
fi

function kube-add {
  ensure-temp-dir
  detect-project

  load-or-gen-kube-basicauth
  load-or-gen-kube-bearertoken

  # Make sure we have the tar files staged on Google Storage
  find-release-tars
  upload-server-tars

  # ensure that environmental variables specifying number of migs to create
  set_num_migs

  parse-master-env
  write-cluster-name     # added by ws
  NODE_INSTANCE_PREFIX="${NEW_GROUP_PREFIX}-minion"
  # extra tag so we will be able to easily distinguish these nodes
  NODE_TAG="${NODE_TAG},${NODE_INSTANCE_PREFIX}"
  create-nodes-template  # added by ws
  create-nodes
}

echo "... calling kube-add" >&2
kube-add

exit 0
