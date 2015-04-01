︠8273810f-3573-4cef-93a0-25d6add80719is︠
%md

Useful command for working with ssd's :-)

    fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4k --iodepth=64 --size=100M --readwrite=randrw --rwmixread=75 ; rm test
︡031709d6-9d87-482a-8da2-51f0548ff7a7︡{"md":"\nUseful command for working with ssd's :-)\n\n    fio --randrepeat=1 --ioengine=libaio --direct=1 --gtod_reduce=1 --name=test --filename=test --bs=4k --iodepth=64 --size=100M --readwrite=randrw --rwmixread=75 ; rm test\n"}︡
︠55c20f5c-b192-46dc-b165-d36afb5f8b6di︠
%md

snapshot all the disks (via a command line script)
︡ef9792e6-7412-4dfb-be1f-b34b8b26fb43︡{"md":"\nsnapshot all the disks (via a command line script)\n"}︡
︠0511c48e-380e-40a8-b4bd-9ffe2c6f8a3a︠

for dc in [5,6]:
    for i in [1..6]:
        if dc == 5:
            zone = 'us-central1-f'
        else:
            zone = 'europe-west1-c'
        print 'time gcloud compute disks snapshot --project="sage-math-inc" "smc%sdc%s-cassandra-ext4" --snapshot-names smc%sdc%-cassandra-snapshot --zone %s &'%(i,dc,i,dc,zone)
︡f7ddbfa5-dca1-4351-8a23-2da08a221868︡{"stdout":"time gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc1dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc2dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc3dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc4dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc5dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc6dc5-cassandra-ext4\" --snapshot-names $NAME --zone us-central1-f &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc1dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc2dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc3dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc4dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc5dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\ntime gcloud compute disks snapshot --project=\"sage-math-inc\" \"smc6dc6-cassandra-ext4\" --snapshot-names $NAME --zone europe-west1-c &\n"}︡
︠52032432-f18c-4c7d-b639-50cf97f175ffi︠
%md

Create ssd disks from the snapshots
︡73509283-a634-40b9-9eb0-1347ffd60edd︡{"md":"\nCreate ssd disks from the snapshots\n"}︡
︠91f8aed3-786d-4451-a69d-ba707b5c9829︠
for dc in [5,6]:
    for i in [1..6]:
        if dc == 5:
            zone = 'us-central1-f'
        else:
            zone = 'europe-west1-c'

        print 'time gcloud compute disks create --project="sage-math-inc" --source-snapshot=smc%sdc%s-cassandra-snapshot --type=pd-ssd smc%sdc%s-cassandra-ssd --zone %s &'%(i,dc,i,dc,zone)
︡7eb0f7f9-5840-43ac-a1b3-af2c1fa230fb︡{"stdout":"time gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc1dc5-cassandra-snapshot --type=pd-ssd smc1dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc2dc5-cassandra-snapshot --type=pd-ssd smc2dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc3dc5-cassandra-snapshot --type=pd-ssd smc3dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc4dc5-cassandra-snapshot --type=pd-ssd smc4dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc5dc5-cassandra-snapshot --type=pd-ssd smc5dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc6dc5-cassandra-snapshot --type=pd-ssd smc6dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc1dc6-cassandra-snapshot --type=pd-ssd smc1dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc2dc6-cassandra-snapshot --type=pd-ssd smc2dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc3dc6-cassandra-snapshot --type=pd-ssd smc3dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc4dc6-cassandra-snapshot --type=pd-ssd smc4dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc5dc6-cassandra-snapshot --type=pd-ssd smc5dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute disks create --project=\"sage-math-inc\" --source-snapshot=smc6dc6-cassandra-snapshot --type=pd-ssd smc6dc6-cassandra-ssd --zone europe-west1-c &\n"}︡
︠228309ab-747b-4d4a-9bdf-504426ecc933i︠
%md
Attach the disks
︡b4cf4660-1a0e-43a0-9d16-5fc22b44e7ae︡{"md":"Attach the disks\n"}︡
︠cc653e19-033d-4cd5-8598-a33e679a9f25︠
for dc in [5,6]:
    for i in [1..6]:
        if dc == 5:
            zone = 'us-central1-f'
        else:
            zone = 'europe-west1-c'

        print 'time gcloud compute instances attach-disk smc%sdc%s --project="sage-math-inc" --disk=smc%sdc%s-cassandra-ssd --zone %s &'%(i,dc,i,dc,zone)




︡5f08618f-5ab2-4538-bf4b-67a1c4a2e4d2︡{"stdout":"time gcloud compute instances attach-disk smc1dc5 --project=\"sage-math-inc\" --disk=smc1dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc2dc5 --project=\"sage-math-inc\" --disk=smc2dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc3dc5 --project=\"sage-math-inc\" --disk=smc3dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc4dc5 --project=\"sage-math-inc\" --disk=smc4dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc5dc5 --project=\"sage-math-inc\" --disk=smc5dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc6dc5 --project=\"sage-math-inc\" --disk=smc6dc5-cassandra-ssd --zone us-central1-f &\ntime gcloud compute instances attach-disk smc1dc6 --project=\"sage-math-inc\" --disk=smc1dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute instances attach-disk smc2dc6 --project=\"sage-math-inc\" --disk=smc2dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute instances attach-disk smc3dc6 --project=\"sage-math-inc\" --disk=smc3dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute instances attach-disk smc4dc6 --project=\"sage-math-inc\" --disk=smc4dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute instances attach-disk smc5dc6 --project=\"sage-math-inc\" --disk=smc5dc6-cassandra-ssd --zone europe-west1-c &\ntime gcloud compute instances attach-disk smc6dc6 --project=\"sage-math-inc\" --disk=smc6dc6-cassandra-ssd --zone europe-west1-c &\n"}︡
︠7b2de153-c502-4945-ae11-67df03850a20i︠
%md

Delete the intermediate snapshots
︡47d0e2a5-ca51-413a-9dd3-3be1ef6c6a22︡{"md":"\nDelete the intermediate snapshots\n"}︡
︠2cac9b89-f33e-480f-a594-68ce0f91512d︠
for dc in [5,6]:
    for i in [1..6]:
        print 'time gcloud compute snapshots delete  smc%sdc%s-cassandra-snapshot --quiet --project="sage-math-inc"   &'%(i,dc)
︡4addebc3-aa4a-42a2-880c-0176a6e8d2ca︡{"stdout":"time gcloud compute snapshots delete  smc1dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc2dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc3dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc4dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc5dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc6dc5-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc1dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc2dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc3dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc4dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc5dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\ntime gcloud compute snapshots delete  smc6dc6-cassandra-snapshot --quiet --project=\"sage-math-inc\"   &\n"}︡
︠094fbd22-dfa5-4d58-8c8f-5730143ac11ci︠
%md
Detach the old non-SSD disks
︡27c91caf-8143-4f62-9f0b-5ea6e2184cb8︡{"md":"Detach the old non-SSD disks\n"}︡
︠fbc351ac-1977-4ceb-be0c-853a46c00e60︠




︠9c13383f-41d4-44d8-8e1f-3eaeff53a4a6i︠
%md
Delete the old non-SSD disks
︡71719509-dd0f-4120-b437-bbf27401da1b︡{"md":"Delete the old non-SSD disks\n"}︡
︠a0bd59de-7046-4bcc-8578-6bba7dd25487︠











