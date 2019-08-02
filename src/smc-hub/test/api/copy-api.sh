#!/usr/bin/env bash
# silly helper script to remind hsy how to query the DB from withing a cc-in-cc project

set -evx

PORT=${PORT:-56754}
CCinCC=${CCinCC:-"14eed217-2d3c-4975-a381-b69edcb40e0e"}

API=http://localhost:$PORT/$CCinCC/port/$PORT/api/v1
Q() {
    curl -X POST -u $KEY: $@
}

KEY=sk_XB003g8HHcyT1y4S3T5w9IW2

## issue copy, needs hub in "kucalc" mode (if this works at all, though)
SRC=bc6f81b3-25ad-4d58-ae4a-65649fae4fa5
TAR=e24ba30d-edcd-479f-8a26-bbe81f38296c
PTH=x.md
Q -d src_project_id=$SRC -d src_path=$PTH -d target_project_id=$TAR -d wait_until_done=false $API/copy_path_between_projects


## status
## TODO: use jq to extract the copy_path_id from above, query, wait a few secs, and then query it again
PATHID=002cdde3-e79c-4d46-a759-f6464a5360c9
Q -d copy_path_id=$PATHID $API/copy_path_status

echo "double check DB"
psql -x -c "SELECT * FROM copy_paths WHERE id = '$PATHID';"