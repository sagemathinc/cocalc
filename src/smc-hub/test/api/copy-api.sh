#!/usr/bin/env bash
# silly helper script to remind hsy how to query the DB from withing a cc-in-cc project

set -evx

PORT=${PORT:-56754}
CCinCC=${CCinCC:-"14eed217-2d3c-4975-a381-b69edcb40e0e"}

API=http://localhost:$PORT/$CCinCC/port/$PORT/api/v1
Q() {
    curl -s -X POST -u $KEY: $@ | jq
}

#KEY=sk_XB003g8HHcyT1y4S3T5w9IW2
KEY=sk_s1GbVM3zLf6LgksdMT1ygtd3

# project no access!
NOACC=4f6e8e03-6689-40b7-93fe-c2591278c252

## issue copy, needs hub in "kucalc" mode (if this works at all, though)
SRC=bc6f81b3-25ad-4d58-ae4a-65649fae4fa5
TAR=7a5a42cf-b904-4a57-ba8d-1809533c1368
PTH=bar.md
#Q -d src_project_id=$SRC -d src_path=$PTH -d target_project_id=$TAR -d wait_until_done=false -d scheduled="`date -d '+1 minute' --utc +'%Y-%m-%dT%H:%M:%S'`" $API/copy_path_between_projects


## status
## TODO: use jq to extract the copy_path_id from above, query, wait a few secs, and then query it again
PATHID=63755ed1-a6d5-4c3e-9bdf-0a31f790bdcf
#Q -d copy_path_id=$PATHID $API/copy_path_status

#echo "double check DB"
#psql -x -c "SELECT * FROM copy_paths WHERE id = '$PATHID';"


## query status
source_project_id=bc6f81b3-25ad-4d58-ae4a-65649fae4fa5
source_path=bar.md
target_project_id=7a5a42cf-b904-4a57-ba8d-1809533c1368

#-d pending=false
Q -d offset=0 -d src_project_id=$NOACC -d src_path=$source_path -d target_project_id=$target_project_id -d failed=false -d limit=500  $API/copy_path_status


PATHID2=f4872d07-d3db-46c4-808a-0b38584ac2d0
Q -d copy_path_id=$PATHID2 $API/copy_path_status
Q -d copy_path_id=$PATHID2 $API/copy_path_delete
Q -d copy_path_id=$PATHID2 $API/copy_path_status
