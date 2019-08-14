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
TRG=7a5a42cf-b904-4a57-ba8d-1809533c1368
PTH=bar.md
Q -d src_project_id=$SRC -d src_path=$PTH -d target_project_id=$TRG -d wait_until_done=false -d scheduled="`date -d '+1 minute' --utc +'%Y-%m-%dT%H:%M:%S'`" $API/copy_path_between_projects
#Q -d src_project_id=$SRC -d src_path=$PTH -d target_project_id=$TRG  $API/copy_path_between_projects

## status
## TODO: use jq to extract the copy_path_id from above, query, wait a few secs, and then query it again
PATHID=63755ed1-a6d5-4c3e-9bdf-0a31f790bdcf
#Q -d copy_path_id=$PATHID $API/copy_path_status

#echo "double check DB"
#psql -x -c "SELECT * FROM copy_paths WHERE id = '$PATHID';"


## query status

#-d pending=false
#-d failed=true
#-d src_path=$PTH
#-d src_project_id=$SRC 
Q -d offset=0 -d target_project_id=$TRG  -d limit=10  $API/copy_path_status


PATHID2=f4872d07-d3db-46c4-808a-0b38584ac2d0
#Q -d copy_path_id=$PATHID2 $API/copy_path_status
#Q -d copy_path_id=$PATHID2 $API/copy_path_delete
#Q -d copy_path_id=$PATHID2 $API/copy_path_status
