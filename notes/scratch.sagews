︠b5059344-1ef8-4f6d-8992-27e1e64416f1︠
0.045*30.5*24*8
︡768b12b0-8ac0-4d53-9ad1-50d614bb4ce5︡{"stdout":"263.520000000000\n"}︡
︠76c2af91-2f03-43a7-8351-4d9cdc8aa2a8︠
smc1-europe-west1-d
smc2-us-central1-c
smc1-us-central1-c
smc0-us-central1-c

︠d07d0405-9aa7-46b8-9b08-3f6d4e5f02e7︠
'gcloud compute instances describe storage0-us --zone=us-central1-c --format=json'.split()
︡67b6ed55-c633-449f-b281-fe2eb058495c︡{"stdout":"['gcloud', 'compute', 'instances', 'describe', 'storage0-us', '--zone=us-central1-c', '--format=json']\n"}︡
︠9988c1db-426e-44cd-bd8a-506870690e75︠
len('2015-05-05-235504')
︡5edf2220-af40-4670-a8d5-dfa285150fe5︡{"stdout":"17\n"}︡
︠c9017881-6182-414c-a878-ca255a019f77︠
600*.17
︡a9e822d9-ed24-4954-80de-ef4c92b4521e︡{"stdout":"102.000000000000\n"}︡
︠44828861-5262-4b55-9658-dbed09fc03a8︠
%python
t=time.time(); a=sum(range(10**6)); time.time()-t
︡10fc4f73-a409-46dd-8374-650692fc7958︡{"stdout":"0.07336616516113281\n"}︡
︠b453d25a-b144-4e41-a2bd-e647b7e12b2d︠
%python
t=time.time(); a=sum(range(10**7)); time.time()-t
︡f4e0aae1-e86a-441f-b6a0-d3d5a2566198︡{"stdout":"0.5920529365539551"}︡{"stdout":"\n"}︡
︠28c1ed63-31a1-4444-9275-07351feda518︠
import time; time.strftime("%Y-%m-%d-%H%M%S")
︡106cb21b-8fe8-46e4-8442-b1a2c3084b5d︡{"stdout":"'2015-05-09-033608'\n"}︡
︠6687c590-0db3-49d2-8c81-45b45c7269a8︠
sudo salvus/salvus/scripts/gb_storage.py close 0033c3ce-4a34-47fe-9fe9-b1cb06ef9593
sudo salvus/salvus/scripts/gb_storage.py close 00425f9a-9425-40fa-b146-0208c5fff4b3
sudo salvus/salvus/scripts/gb_storage.py close 0044ebb0-04f0-4f0a-a6c4-9a9550ba9fdd
sudo salvus/salvus/scripts/gb_storage.py close 004f740e-60a8-42d6-b03b-99a76bf4de2b
sudo salvus/salvus/scripts/gb_storage.py close 00599e84-9c84-4857-b056-422f7ea4584e
sudo salvus/salvus/scripts/gb_storage.py close 0069be7f-f47d-472b-b93e-fa3fb79bbb4d
︠674fba44-1afc-42a1-8b67-826aaf503adb︠
0.023*50000
︡c3e2512b-b2e3-4609-87c7-c0cf2440d4d8︡{"stdout":"1150.00000000000\n"}︡
︠c9b73ad8-f997-41da-b6b5-11ef09aff302︠
24*3000
︡53cf21c2-a68d-414a-9aab-1bc5a596c61c︡{"stdout":"72000\n"}︡
︠08a46fcc-5cf9-4e8f-808d-0573a91fc20a︠
1.280/32 * 50000
︡170fc551-d0f5-4650-8c88-20621b0c605e︡{"stdout":"2000.00000000000\n"}︡
︠5c4ca6eb-f0c3-44cf-8bf7-ef71324a238f︠
for i in [10..21]:
    print "get_from %s &"%i
︡207d7765-0d8c-4b2f-8d26-cf57b3b2c39e︡{"stdout":"get_from 10 &\nget_from 11 &\nget_from 12 &\nget_from 13 &\nget_from 14 &\nget_from 15 &\nget_from 16 &\nget_from 17 &\nget_from 18 &\nget_from 19 &\nget_from 20 &\nget_from 21 &\n"}︡
︠15e3cfcf-9cca-42a5-aecb-fbd6cd551a94︠

bpython3 diveintopython3 libpython3-dev python3-dev python3-aeidon python3-alabaster python3-anyjson python3-astropy python3-audioread python3-args python3-babel python3-bottle python3-bs4 python3-bsddb3 python3-celery python3-changelog python3-cherrypy3 python3-crypto python3-cryptography python3-csb python3-cssutils python3-dateutil python3-decorator python3-defer python3-distutils-extra python3-django python3-django-xmlrpc python3-django-tables2 python3-django-model-utils python3-django-jsonfield python3-django-filters python3-dns python3-dnsq python3-doc python3-docutils python3-ecdsa python3-empy python3-examples python3-expiringdict python3-extras python3-feedparser python3-fftw3 python3-flake8 python3-flask python3-flask-sqlalchemy python3-flask-script python3-flask-principal python3-fysom python3-gdal python3-genshi python3-geoip python3-gmpy2 python3-gnupg python3-greenlet python3-gsw python3-h5py python3-httplib2 python3-icalendar python3-idna python3-ipy python3-jinja2 python3-jsmin python3-lesscpy python3-levenshtein python3-linop python3-mako python3-mia python3-misaka python3-mockito python3-mock python3-mpi4py python3-mpmath python3-msgpack python3-nose2 python3-nose2-cov python3-nine python3-numexpr python3-numpy python3-oauth python3-openssl python3-pandas python3-paramiko python3-pandocfilters python3-patsy python3-pep8 python3-persistent python3-pexpect python3-pil python3-pyasn1 python3-progressbar python3-potr python3-ply python3-pkginfo python3-pygraph python3-pygments python3-pyscss python3-pyramid python3-pyro4 python3-rdflib python3-releases python3-rsa python3-scipy python3-shortuuid python3-simplejson python3-skimage python3-six python3-sphinx python3-sphere python3-sqlalchemy python3-tables python3-testtools python3-urllib3 python3-venv python3-virtualenv python3-werkzeug python3-xlrd python3-xlsxwriter python3-yaml python3-zmq
︠af1e1f44-32bb-4ecf-b07c-1739fa6d31cb︠
python3-pandas  python3-matplotlib python3-numpy python3-xlrd python3-nose
︠16199a26-031c-4722-bac8-87fa1fb72963︠

echo '{ "language": "r", "argv": [ "R", "-e", "IRkernel::main()", "—args", "{connection_file}" ], "display_name": "R" }'  > /usr/local/share/jupyter/kernels/ir/kernel.json



︠dd835178-7fab-42b3-88d2-1ceae200e083︠
for i in [10..21]:
    print 'echo compute%sdc0; ssh 10.1.%s.1 "ifconfig bond0"|grep "inet addr"'%(i,i)
︡7ac7d85d-165b-4c0f-8750-491e5c6562fe︡{"stdout":"echo compute10dc0; ssh 10.1.10.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute11dc0; ssh 10.1.11.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute12dc0; ssh 10.1.12.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute13dc0; ssh 10.1.13.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute14dc0; ssh 10.1.14.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute15dc0; ssh 10.1.15.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute16dc0; ssh 10.1.16.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute17dc0; ssh 10.1.17.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute18dc0; ssh 10.1.18.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute19dc0; ssh 10.1.19.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute20dc0; ssh 10.1.20.1 \"ifconfig bond0\"|grep \"inet addr\"\necho compute21dc0; ssh 10.1.21.1 \"ifconfig bond0\"|grep \"inet addr\"\n"}︡
︠fa5b1f78-0c61-455c-af0b-875389580660︠
' '.join(['10.3.%s.5'%i for i in [1..8]])
︡6fff0a5d-cd77-4c85-af27-1b85eb297318︡{"stdout":"'10.3.1.5 10.3.2.5 10.3.3.5 10.3.4.5 10.3.5.5 10.3.6.5 10.3.7.5 10.3.8.5'\n"}︡
︠0025d702-e1f7-4de7-a5ee-0d5400099621︠
#0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc
#44468f71-5e2d-4685-8d60-95c9d703bea0
#806edbba-a66b-4710-9c65-47dd70503fc9
#94d4ebc1-d5fc-4790-affe-ab4738ca0384
#d0bfc232-beeb-4062-9ad5-439c794594f3
#f71dab5b-f40c-48db-a3d2-eefe6ec55f01

 2 |        False |   null |  10.3.6.5 | 0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc
  2 |        False |   null |  10.3.8.5 | 44468f71-5e2d-4685-8d60-95c9d703bea0
  2 |        False |   null |  10.3.5.5 | 806edbba-a66b-4710-9c65-47dd70503fc9
  2 |        False |   null |  10.3.3.5 | 8f5247e5-d449-4356-9ca7-1d971c79c7df
  2 |        False |   null |  10.3.4.5 | 94d4ebc1-d5fc-4790-affe-ab4738ca0384
  2 |        False |   null |  10.3.1.5 | c2ba4efc-8b4d-4447-8b0b-6a512e1cac97
  2 |        False |   null |  10.3.7.5 | d0bfc232-beeb-4062-9ad5-439c794594f3
  2 |        False |   null |  10.3.2.5 | f71dab5b-f40c-48db-a3d2-eefe6ec55f01
︠b4ae02c3-c093-46b7-8af7-133db6788640︠
template = """echo "x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'zzz', cb:(e)->console.log('DONE',e); process.exit())) " | coffee"""
for server_id in '0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc 44468f71-5e2d-4685-8d60-95c9d703bea0 806edbba-a66b-4710-9c65-47dd70503fc9 94d4ebc1-d5fc-4790-affe-ab4738ca0384 d0bfc232-beeb-4062-9ad5-439c794594f3 f71dab5b-f40c-48db-a3d2-eefe6ec55f01 c2ba4efc-8b4d-4447-8b0b-6a512e1cac97 8f5247e5-d449-4356-9ca7-1d971c79c7df'.split():
    print template.replace('zzz', server_id)

︡570a8941-1038-47ef-a1f3-1a16ee2e14ed︡{"stdout":"echo \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'44468f71-5e2d-4685-8d60-95c9d703bea0', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'806edbba-a66b-4710-9c65-47dd70503fc9', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'94d4ebc1-d5fc-4790-affe-ab4738ca0384', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'d0bfc232-beeb-4062-9ad5-439c794594f3', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'f71dab5b-f40c-48db-a3d2-eefe6ec55f01', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'c2ba4efc-8b4d-4447-8b0b-6a512e1cac97', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\necho \"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'8f5247e5-d449-4356-9ca7-1d971c79c7df', cb:(e)->console.log('DONE',e); process.exit())) \" | coffee\n"}︡
︠b9418461-e0a0-4020-bcb8-f5c9071e3846︠
echo "x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.decommission_server(server_id:'806edbba-a66b-4710-9c65-47dd70503fc9', cb:(e)->console.log('DONE',e); process.exit())) " | coffee

︠740bfaa0-0e7a-4ebe-9e5e-09465fae6328︠
263%60
︡e852fd79-c002-4b0f-b937-9736206e5392︡{"stdout":"23\n"}︡
︠01349b97-5d80-4b63-9726-c345ff7e343d︠
24*30
︡7c41bcba-e5bd-4ac2-b7ae-5ea4dd4bdb45︡{"stdout":"720\n"}︡
︠0af98943-976d-4767-8740-c49b35e0c701︠
1.658 * 24*30
︡18c7c1fb-7037-4e81-9bd6-493600691668︡{"stdout":"1193.76000000000\n"}︡
︠560883a1-762b-4c12-bc47-4b0241f9a9a2︠
0.0035 * 60*24*30
︡a1bceb90-7e62-4270-bf93-95fc63874aca︡{"stdout":"151.200000000000\n"}︡
︠b059437e-09ac-43ff-8a66-b2c5481156a6︠
- https://wakari.io/ -- closed source, freemium/enterprise

- https://www.terminal.com/ -- Closed source; freemium

- https://cloud.sagemath.com -- open source; completely free (right now)

- https://c9.io/ -- open source, freemium

- http://runnable.com/ -- closed source, no business model

- https://www.pythonanywhere.com/ -- closed source, freemium

- https://www.nitrous.io/ -- closed source; freemium

- https://codio.com/ -- closed source; freemium (free for public)

- https://codenvy.com/ -- closed source; freemium/enterprise

- https://koding.com/ -- closed source; freemium



Also Wakari (https://wakari.io/), SageMathCloud (https://cloud.sagemath.com/),
︠1fe620ec-330a-446a-895a-6d4e30df8aa3︠
s="""128.208.160.164 cloud1
128.208.160.166 cloud2
128.95.224.237 cloud3
128.95.224.230 cloud4
128.208.160.207 cloud5
128.208.160.208 cloud6
128.208.160.209 cloud7"""
for x in s.splitlines():
    print x + ".math.washington.edu"
︡8a4f2df6-a157-4f71-9775-37d73b2f9369︡{"stdout":"128.208.160.164 cloud1.math.washington.edu\n128.208.160.166 cloud2.math.washington.edu\n128.95.224.237 cloud3.math.washington.edu\n128.95.224.230 cloud4.math.washington.edu\n128.208.160.207 cloud5.math.washington.edu\n128.208.160.208 cloud6.math.washington.edu\n128.208.160.209 cloud7.math.washington.edu\n"}︡
︠cdd5bd87-8331-4fa6-92b9-14ac817dd541︠
time rsync -axvH -e 'ssh -o StrictHostKeyChecking=no -p 2222' --delete --exclude /bup/bups/cloud10.math.washington.edu/e66d85b8-eec5-41ff-9c4c-4354a39b9cc9/cache/ root@cloud10.math.washington.edu:/bup/bups/cloud10.math.washington.edu/e66d85b8-eec5-41ff-9c4c-4354a39b9cc9/ bup/bups/cloud10.math.washington.edu/e66d85b8-eec5-41ff-9c4c-4354a39b9cc9/
︠43c3cccf-4c27-46b3-9a2f-67898dbc256a︠
s="""10.1.10.5
10.1.11.5
10.1.12.5
10.1.13.5
10.1.14.5
10.1.15.5
10.1.16.5
10.1.17.5
10.1.18.5
10.1.19.5
10.1.20.5
10.1.21.5"""
for x in s.splitlines():
    a = x.split('.')
    print "mv -v %s %s"%(x,'cloud%s.math.washington.edu'%a[2])
︡746d6fe7-4dae-4420-9dfa-cc3d8c9cfc23︡{"stdout":"mv -v 10.1.10.5 cloud10.math.washington.edu\nmv -v 10.1.11.5 cloud11.math.washington.edu\nmv -v 10.1.12.5 cloud12.math.washington.edu\nmv -v 10.1.13.5 cloud13.math.washington.edu\nmv -v 10.1.14.5 cloud14.math.washington.edu\nmv -v 10.1.15.5 cloud15.math.washington.edu\nmv -v 10.1.16.5 cloud16.math.washington.edu\nmv -v 10.1.17.5 cloud17.math.washington.edu\nmv -v 10.1.18.5 cloud18.math.washington.edu\nmv -v 10.1.19.5 cloud19.math.washington.edu\nmv -v 10.1.20.5 cloud20.math.washington.edu\nmv -v 10.1.21.5 cloud21.math.washington.edu\n"}︡
︠0b7c5f78-3798-47d7-9d1d-d6abf2d1802f︠
s="""10.1.1.5
10.1.2.5
10.1.3.5
10.1.4.5
10.1.5.5
10.1.6.5
10.1.7.5"""
for x in s.splitlines():
    a = x.split('.')
    print "mv -v %s %s"%(x,'cloud%s.math.washington.edu'%a[2])
︡003d5905-e74c-4811-96b8-b59bf44c38a9︡{"stdout":"mv -v 10.1.1.5 cloud1.math.washington.edu\nmv -v 10.1.2.5 cloud2.math.washington.edu\nmv -v 10.1.3.5 cloud3.math.washington.edu\nmv -v 10.1.4.5 cloud4.math.washington.edu\nmv -v 10.1.5.5 cloud5.math.washington.edu\nmv -v 10.1.6.5 cloud6.math.washington.edu\nmv -v 10.1.7.5 cloud7.math.washington.edu\n"}︡
︠7a6a0013-6a0e-4885-8dfa-fff65950d1ca︠
2000*.04*12
︡eaf75acd-db80-4511-982d-e6013453e339︡{"stdout":"960.000000000000\n"}︡
︠56ea0640-97db-498a-9731-688b4575bd2f︠
s="""hdd/backups@2014-11-01_00.00.01--180d                        0      -    30K  -
hdd/backups@2014-12-01_00.00.02--180d                        0      -    30K  -
hdd/backups@2015-01-01_00.00.02--180d                        0      -    30K  -
hdd/backups@2015-02-01_00.00.01--180d                        0      -    30K  -
hdd/backups@2015-02-15_00.00.02--30d                         0      -    30K  -
hdd/backups@2015-02-22_00.00.02--30d                         0      -    30K  -
hdd/backups@2015-03-01_00.00.02--30d                         0      -    30K  -
hdd/backups@2015-03-01_00.00.02--180d                        0      -    30K  -
hdd/backups@2015-03-08_00.00.02--30d                         0      -    30K  -
hdd/backups@2015-03-09_00.00.44--7d                          0      -    30K  -
hdd/backups@2015-03-10_00.00.07--7d                          0      -    30K  -
hdd/backups@2015-03-11_00.02.58--7d                          0      -    30K  -
hdd/backups@2015-03-12_00.00.02--7d                          0      -    30K  -
hdd/backups@2015-03-13_00.00.02--7d                          0      -    30K  -
hdd/backups@2015-03-14_00.00.02--7d                          0      -    30K  -
hdd/backups@2015-03-15_00.00.01--30d                         0      -    30K  -
hdd/backups@2015-03-15_00.00.01--7d                          0      -    30K  -
hdd/backups/bup@2014-11-01_00.00.01--180d                    0      -    32K  -
hdd/backups/bup@2014-12-01_00.00.02--180d                    0      -    32K  -
hdd/backups/bup@2015-01-01_00.00.02--180d                    0      -    32K  -
hdd/backups/bup@2015-02-01_00.00.01--180d                    0      -    32K  -
hdd/backups/bup@2015-02-15_00.00.02--30d                     0      -    32K  -
hdd/backups/bup@2015-02-22_00.00.02--30d                     0      -    32K  -
hdd/backups/bup@2015-03-01_00.00.02--30d                     0      -    32K  -
hdd/backups/bup@2015-03-01_00.00.02--180d                    0      -    32K  -
hdd/backups/bup@2015-03-08_00.00.02--30d                     0      -    32K  -
hdd/backups/bup@2015-03-09_00.00.44--7d                      0      -    32K  -
hdd/backups/bup@2015-03-10_00.00.07--7d                      0      -    32K  -
hdd/backups/bup@2015-03-11_00.02.58--7d                      0      -    32K  -
hdd/backups/bup@2015-03-12_00.00.02--7d                      0      -    32K  -
hdd/backups/bup@2015-03-13_00.00.02--7d                      0      -    32K  -
hdd/backups/bup@2015-03-14_00.00.02--7d                      0      -    32K  -
hdd/backups/bup@2015-03-15_00.00.01--30d                     0      -    32K  -
hdd/backups/bup@2015-03-15_00.00.01--7d                      0      -    32K  -
hdd/backups/bup/bups@2014-11-01_00.00.01--180d           8.80G      -  1.04T  -
hdd/backups/bup/bups@2014-12-01_00.00.02--180d           7.30G      -  1.16T  -
hdd/backups/bup/bups@2015-01-01_00.00.02--180d           8.03G      -  1.24T  -
hdd/backups/bup/bups@2015-02-01_00.00.01--180d           10.6G      -  1.34T  -
hdd/backups/bup/bups@2015-02-15_00.00.02--30d            6.63G      -  1.38T  -
hdd/backups/bup/bups@2015-02-22_00.00.02--30d            6.03G      -  1.44T  -
hdd/backups/bup/bups@2015-03-01_00.00.02--30d                0      -  1.46T  -
hdd/backups/bup/bups@2015-03-01_00.00.02--180d               0      -  1.46T  -
hdd/backups/bup/bups@2015-03-08_00.00.02--30d            2.66G      -  1.49T  -
hdd/backups/bup/bups@2015-03-09_00.00.44--7d             2.00G      -  1.50T  -
hdd/backups/bup/bups@2015-03-10_00.00.07--7d             2.36G      -  1.50T  -
hdd/backups/bup/bups@2015-03-11_00.02.58--7d             2.80G      -  1.50T  -
hdd/backups/bup/bups@2015-03-12_00.00.02--7d             1.59G      -  1.50T  -
hdd/backups/bup/bups@2015-03-13_00.00.02--7d             1.22G      -  1.51T  -
hdd/backups/bup/bups@2015-03-14_00.00.02--7d              563M      -  1.51T  -
hdd/backups/bup/bups@2015-03-15_00.00.01--30d                0      -  1.51T  -
hdd/backups/bup/bups@2015-03-15_00.00.01--7d                 0      -  1.51T  -
hdd/backups/bup/cassandra-dc0@2014-11-01_00.00.01--180d   228M      -  46.7G  -
hdd/backups/bup/cassandra-dc0@2014-12-01_00.00.02--180d  16.0G      -  62.4G  -
hdd/backups/bup/cassandra-dc0@2015-01-01_00.00.02--180d   160M      -  31.0G  -
hdd/backups/bup/cassandra-dc0@2015-02-01_00.00.01--180d   213M      -  37.8G  -
hdd/backups/bup/cassandra-dc0@2015-02-15_00.00.02--30d    234M      -  41.9G  -
hdd/backups/bup/cassandra-dc0@2015-02-22_00.00.02--30d       0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-01_00.00.02--30d       0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-01_00.00.02--180d      0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-08_00.00.02--30d       0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-09_00.00.44--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-10_00.00.07--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-11_00.02.58--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-12_00.00.02--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-13_00.00.02--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-14_00.00.02--7d        0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-15_00.00.01--30d       0      -  42.1G  -
hdd/backups/bup/cassandra-dc0@2015-03-15_00.00.01--7d        0      -  42.1G  -"""


for x in s.splitlines():
    print "zfs destroy -r %s"%x.split()[0]
︡bd6c8d63-62aa-41f0-932d-d5e2bdbcd214︡{"stdout":"zfs destroy -r hdd/backups@2014-11-01_00.00.01--180d\nzfs destroy -r hdd/backups@2014-12-01_00.00.02--180d\nzfs destroy -r hdd/backups@2015-01-01_00.00.02--180d\nzfs destroy -r hdd/backups@2015-02-01_00.00.01--180d\nzfs destroy -r hdd/backups@2015-02-15_00.00.02--30d\nzfs destroy -r hdd/backups@2015-02-22_00.00.02--30d\nzfs destroy -r hdd/backups@2015-03-01_00.00.02--30d\nzfs destroy -r hdd/backups@2015-03-01_00.00.02--180d\nzfs destroy -r hdd/backups@2015-03-08_00.00.02--30d\nzfs destroy -r hdd/backups@2015-03-09_00.00.44--7d\nzfs destroy -r hdd/backups@2015-03-10_00.00.07--7d\nzfs destroy -r hdd/backups@2015-03-11_00.02.58--7d\nzfs destroy -r hdd/backups@2015-03-12_00.00.02--7d\nzfs destroy -r hdd/backups@2015-03-13_00.00.02--7d\nzfs destroy -r hdd/backups@2015-03-14_00.00.02--7d\nzfs destroy -r hdd/backups@2015-03-15_00.00.01--30d\nzfs destroy -r hdd/backups@2015-03-15_00.00.01--7d\nzfs destroy -r hdd/backups/bup@2014-11-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup@2014-12-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup@2015-01-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup@2015-02-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup@2015-02-15_00.00.02--30d\nzfs destroy -r hdd/backups/bup@2015-02-22_00.00.02--30d\nzfs destroy -r hdd/backups/bup@2015-03-01_00.00.02--30d\nzfs destroy -r hdd/backups/bup@2015-03-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup@2015-03-08_00.00.02--30d\nzfs destroy -r hdd/backups/bup@2015-03-09_00.00.44--7d\nzfs destroy -r hdd/backups/bup@2015-03-10_00.00.07--7d\nzfs destroy -r hdd/backups/bup@2015-03-11_00.02.58--7d\nzfs destroy -r hdd/backups/bup@2015-03-12_00.00.02--7d\nzfs destroy -r hdd/backups/bup@2015-03-13_00.00.02--7d\nzfs destroy -r hdd/backups/bup@2015-03-14_00.00.02--7d\nzfs destroy -r hdd/backups/bup@2015-03-15_00.00.01--30d\nzfs destroy -r hdd/backups/bup@2015-03-15_00.00.01--7d\nzfs destroy -r hdd/backups/bup/bups@2014-11-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup/bups@2014-12-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/bups@2015-01-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/bups@2015-02-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup/bups@2015-02-15_00.00.02--30d\nzfs destroy -r hdd/backups/bup/bups@2015-02-22_00.00.02--30d\nzfs destroy -r hdd/backups/bup/bups@2015-03-01_00.00.02--30d\nzfs destroy -r hdd/backups/bup/bups@2015-03-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/bups@2015-03-08_00.00.02--30d\nzfs destroy -r hdd/backups/bup/bups@2015-03-09_00.00.44--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-10_00.00.07--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-11_00.02.58--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-12_00.00.02--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-13_00.00.02--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-14_00.00.02--7d\nzfs destroy -r hdd/backups/bup/bups@2015-03-15_00.00.01--30d\nzfs destroy -r hdd/backups/bup/bups@2015-03-15_00.00.01--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2014-11-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2014-12-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-01-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-02-01_00.00.01--180d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-02-15_00.00.02--30d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-02-22_00.00.02--30d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-01_00.00.02--30d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-01_00.00.02--180d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-08_00.00.02--30d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-09_00.00.44--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-10_00.00.07--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-11_00.02.58--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-12_00.00.02--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-13_00.00.02--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-14_00.00.02--7d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-15_00.00.01--30d\nzfs destroy -r hdd/backups/bup/cassandra-dc0@2015-03-15_00.00.01--7d\n"}︡
︠59244150-b67c-47f4-a89f-b3b0777665f8︠
3600*24
︡3a772ba2-4b72-46f7-9535-8afc9b4d919e︡{"stdout":"86400\n"}︡
︠38d20e1b-ea67-434f-bf71-ea5b5682de8d︠
54.230.70.138
54.230.71.57
54.230.70.88
54.230.71.45
54.230.71.11
54.230.71.55
54.230.71.153
54.230.69.37
︠e176715e-881f-4744-b33a-77afbb9c29e9︠
smc8dc6      europe-west1-c n1-standard-1 10.240.58.167  130.211.106.157 RUNNING
smc3dc6      europe-west1-c n1-standard-1 10.240.149.25  104.155.22.241  RUNNING
smc6dc6      europe-west1-c n1-standard-1 10.240.191.79  104.155.31.6    RUNNING
smc1dc6      europe-west1-c n1-standard-1 10.240.81.144  146.148.18.178  RUNNING
smc5dc6      europe-west1-c n1-standard-1 10.240.38.46   104.155.0.146   RUNNING
smc7dc6      europe-west1-c n1-standard-1 10.240.236.161 104.155.16.208  RUNNING
smc2dc6      europe-west1-c n1-standard-1 10.240.91.234  104.155.10.82   RUNNING
smc4dc6      europe-west1-c n1-standard-1 10.240.22.152  104.155.1.201   RUNNING
smc4dc5      us-central1-f  n1-standard-1 10.240.248.84  23.251.153.5    RUNNING
smc5dc5      us-central1-f  n1-standard-1 10.240.84.228  104.154.58.227  RUNNING
smc7dc5      us-central1-f  n1-standard-1 10.240.220.12  104.154.40.66   RUNNING
smc6dc5      us-central1-f  n1-standard-1 10.240.208.13  130.211.141.57  RUNNING
smc2dc5      us-central1-f  n1-standard-1 10.240.220.8   146.148.55.223  RUNNING
smc1dc5      us-central1-f  n1-standard-1 10.240.97.10   23.251.151.188  RUNNING
smc8dc5      us-central1-f  n1-standard-1 10.240.107.210 130.211.136.191 RUNNING
smc3dc5      us-central1-f  n1-standard-1 10.240.137.201 107.178.215.124 RUNNING
︠234f3a2d-2842-4b06-af2e-0c201652af0f︠
for j in [5,6]:
    for i in [1..8]:
        print 'echo "smc%sdc%s"; ssh smc%sdc%s "cd salvus/salvus; . salvus-env; time nodetool repair"'%(i,j,i,j)
︡d479a2fc-747b-423e-81d3-b529b531cf61︡{"stdout":"echo \"smc1dc5\"; ssh smc1dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc2dc5\"; ssh smc2dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc3dc5\"; ssh smc3dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc4dc5\"; ssh smc4dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc5dc5\"; ssh smc5dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc6dc5\"; ssh smc6dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc7dc5\"; ssh smc7dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc8dc5\"; ssh smc8dc5 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc1dc6\"; ssh smc1dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc2dc6\"; ssh smc2dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc3dc6\"; ssh smc3dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc4dc6\"; ssh smc4dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc5dc6\"; ssh smc5dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc6dc6\"; ssh smc6dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc7dc6\"; ssh smc7dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\necho \"smc8dc6\"; ssh smc8dc6 \"cd salvus/salvus; . salvus-env; time nodetool repair\"\n"}︡
︠1b3a1358-59f8-4b1b-b5a0-6cf80f8314c0︠
for j in [5,6]:
    for i in [1..8]:
        print 'echo "smc%sdc%s"; ssh smc%sdc%s "cd salvus/salvus; . salvus-env; time nodetool cleanup"'%(i,j,i,j)

︡466f08be-b6de-4ad4-b22a-b6e066dbb681︡{"stdout":"echo \"smc1dc5\"; ssh smc1dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc2dc5\"; ssh smc2dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc3dc5\"; ssh smc3dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc4dc5\"; ssh smc4dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc5dc5\"; ssh smc5dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc6dc5\"; ssh smc6dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc7dc5\"; ssh smc7dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc8dc5\"; ssh smc8dc5 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc1dc6\"; ssh smc1dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc2dc6\"; ssh smc2dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc3dc6\"; ssh smc3dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc4dc6\"; ssh smc4dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc5dc6\"; ssh smc5dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc6dc6\"; ssh smc6dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc7dc6\"; ssh smc7dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\necho \"smc8dc6\"; ssh smc8dc6 \"cd salvus/salvus; . salvus-env; time nodetool cleanup\"\n"}︡
︠bd01e489-b947-42a6-a980-c36c9a2725a4︠
for j in [5,6]:
    for i in [1..8]:
        print 'cd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc%sdc%s'%(i,j)
︡2c467947-4e3b-4da2-8386-dbe335df4bd6︡{"stdout":"cd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc1dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc2dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc3dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc4dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc5dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc6dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc7dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc8dc5\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc1dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc2dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc3dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc4dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc5dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc6dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc7dc6\ncd ~/salvus/salvus; python ~/salvus/salvus/scripts/cassandra/one_off_upgrade.py smc8dc6\n"}︡
︠668966c5-ea43-4206-8c79-05d41e7eee1c︠
for i in [1..8]:
    for j in [5,6]:
        print 'echo smc%sdc%s; echo "select health,host,server_id from storage_servers;" | cqlsh_connect smc%sdc%s | wc -l'%(i,j,i,j)
︡7f81e8b0-80d1-459e-bce6-821b8b33ca02︡{"stdout":"echo smc1dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc1dc5 | wc -l\necho smc1dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc1dc6 | wc -l\necho smc2dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc2dc5 | wc -l\necho smc2dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc2dc6 | wc -l\necho smc3dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc3dc5 | wc -l\necho smc3dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc3dc6 | wc -l\necho smc4dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc4dc5 | wc -l\necho smc4dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc4dc6 | wc -l\necho smc5dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc5dc5 | wc -l\necho smc5dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc5dc6 | wc -l\necho smc6dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc6dc5 | wc -l\necho smc6dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc6dc6 | wc -l\necho smc7dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc7dc5 | wc -l\necho smc7dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc7dc6 | wc -l\necho smc8dc5; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc8dc5 | wc -l\necho smc8dc6; echo \"select health,host,server_id from storage_servers;\" | cqlsh_connect smc8dc6 | wc -l\n"}︡
︠63c91357-bf9a-4736-9126-589ebb369bc9︠
for i in [12..21]:
    print "mkdir bup/10.1.%s.5 "%i
︡01ec1b80-d2c5-4613-a144-197bf84fe629︡{"stdout":"mkdir bup/10.1.12.5 \nmkdir bup/10.1.13.5 \nmkdir bup/10.1.14.5 \nmkdir bup/10.1.15.5 \nmkdir bup/10.1.16.5 \nmkdir bup/10.1.17.5 \nmkdir bup/10.1.18.5 \nmkdir bup/10.1.19.5 \nmkdir bup/10.1.20.5 \nmkdir bup/10.1.21.5 \n"}︡
︠b18dcd4e-48ef-416e-81c0-929404c5602d︠
%coffeescript

x={};require('bup_server').global_client(cb:(e,c)->x.c=c; status=[];x.c.repair(status:status,dryrun:true,cb:(e,projects)->console.log('DONE',e); x.projects=projects;console.log((a.project for a in status));console.log(projects); process.exit() ))

t=require('misc').walltime(); x={};require('bup_server').global_client(cb:(e,c)->x.c=c; status=[];x.c.database.all_users((e,u)->x.u=u; console.log("done",require('misc').walltime(t),e);  ))



t=require('misc').walltime(); x={};require('bup_server').global_client(cb:(e,c)->x.c=c; status=[];x.c.database.copy_remember_me_cookies_to_accounts((e)->console.log("done",e,require('misc').walltime(t));  ))




︠a6c14deb-53e1-4ed6-923a-9478691a3038︠
for x in """{-1: '199.223.234.31', 2: '10.240.105.11', 3: '10.240.105.11', 4: '10.240.105.11'}
                                                          {-1: '128.208.178.212:2222'}
                                                          {-1: '128.208.178.214:2222'}
                                                          {-1: '128.208.178.218:2222'}
                                                          {-1: '128.208.160.164:2222'}
 {-1: '162.222.183.50', 2: '10.240.155.176', 3: '10.240.155.176', 4: '10.240.155.176'}
                                                           {-1: '128.95.224.237:2222'}
                                                           {-1: '128.95.224.230:2222'}
                                                          {-1: '128.208.178.216:2222'}
                                                          {-1: '128.208.178.222:2222'}
                                                          {-1: '128.208.178.220:2222'}
    {-1: '104.154.56.232', 2: '10.240.10.169', 3: '10.240.10.169', 4: '10.240.10.169'}
    {-1: '162.222.176.40', 2: '10.240.10.221', 3: '10.240.10.221', 4: '10.240.10.221'}
   {-1: '162.222.182.154', 2: '10.240.165.38', 3: '10.240.165.38', 4: '10.240.165.38'}
                                                          {-1: '128.208.178.202:2222'}
                                                          {-1: '128.208.160.166:2222'}
                                                          {-1: '128.208.178.210:2222'}
                                                          {-1: '128.208.160.209:2222'}
      {-1: '23.236.49.76', 2: '10.240.27.152', 3: '10.240.27.152', 4: '10.240.27.152'}
  {-1: '23.236.53.228', 2: '10.240.240.192', 3: '10.240.240.192', 4: '10.240.240.192'}
                                                          {-1: '128.208.160.208:2222'}
                                                          {-1: '128.208.178.200:2222'}
                                                          {-1: '128.208.160.207:2222'}
                                                          {-1: '128.208.178.206:2222'}
                                                          {-1: '128.208.178.208:2222'}
  {-1: '146.148.10.83', 2: '10.240.127.111', 3: '10.240.127.111', 4: '10.240.127.111'}
                                                          {-1: '128.208.178.204:2222'}
    {-1: '130.211.167.63', 2: '10.240.188.32', 3: '10.240.188.32', 4: '10.240.188.32'}""".splitlines():
    if '10.240.' in x:
        addr = x.split()[3][1:-2].strip()
        print "time rsync -axH sage-6.5/ %s:/usr/local/sage/sage-6.5/"%addr
︡81071a92-827f-4f54-ad19-8ddd32c3e7f3︡{"stdout":"time rsync -axH sage-6.5/ 10.240.105.11:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.155.176:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.10.169:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.10.221:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.165.38:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.27.152:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.240.192:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.127.111:/usr/local/sage/sage-6.5/\ntime rsync -axH sage-6.5/ 10.240.188.32:/usr/local/sage/sage-6.5/\n"}︡
︠7401a346-2934-4411-b7aa-252e91393cc3︠
for x in """{-1: '199.223.234.31', 2: '10.240.105.11', 3: '10.240.105.11', 4: '10.240.105.11'}
                                                          {-1: '128.208.178.212:2222'}
                                                          {-1: '128.208.178.214:2222'}
                                                          {-1: '128.208.178.218:2222'}
                                                          {-1: '128.208.160.164:2222'}
 {-1: '162.222.183.50', 2: '10.240.155.176', 3: '10.240.155.176', 4: '10.240.155.176'}
                                                           {-1: '128.95.224.237:2222'}
                                                           {-1: '128.95.224.230:2222'}
                                                          {-1: '128.208.178.216:2222'}
                                                          {-1: '128.208.178.222:2222'}
                                                          {-1: '128.208.178.220:2222'}
    {-1: '104.154.56.232', 2: '10.240.10.169', 3: '10.240.10.169', 4: '10.240.10.169'}
    {-1: '162.222.176.40', 2: '10.240.10.221', 3: '10.240.10.221', 4: '10.240.10.221'}
   {-1: '162.222.182.154', 2: '10.240.165.38', 3: '10.240.165.38', 4: '10.240.165.38'}
                                                          {-1: '128.208.178.202:2222'}
                                                          {-1: '128.208.160.166:2222'}
                                                          {-1: '128.208.178.210:2222'}
                                                          {-1: '128.208.160.209:2222'}
      {-1: '23.236.49.76', 2: '10.240.27.152', 3: '10.240.27.152', 4: '10.240.27.152'}
  {-1: '23.236.53.228', 2: '10.240.240.192', 3: '10.240.240.192', 4: '10.240.240.192'}
                                                          {-1: '128.208.160.208:2222'}
                                                          {-1: '128.208.178.200:2222'}
                                                          {-1: '128.208.160.207:2222'}
                                                          {-1: '128.208.178.206:2222'}
                                                          {-1: '128.208.178.208:2222'}
  {-1: '146.148.10.83', 2: '10.240.127.111', 3: '10.240.127.111', 4: '10.240.127.111'}
                                                          {-1: '128.208.178.204:2222'}
    {-1: '130.211.167.63', 2: '10.240.188.32', 3: '10.240.188.32', 4: '10.240.188.32'}""".splitlines():
    if ':2222' in x:
        addr = x.split()[-1][1:-7].strip()
        print "time rsync -e 'ssh -p 2222' -axH sage-6.5/ %s:/usr/local/sage/sage-6.5/"%

︡b66a9ea0-c251-4dcb-ba4a-f30db117c351︡{"stdout":"128.208.178.212\n128.208.178.214\n128.208.178.218\n128.208.160.164\n128.95.224.237\n128.95.224.230\n128.208.178.216\n128.208.178.222\n128.208.178.220\n128.208.178.202\n128.208.160.166\n128.208.178.210\n128.208.160.209\n128.208.160.208\n128.208.178.200\n128.208.160.207\n128.208.178.206\n128.208.178.208\n128.208.178.204\n"}︡
︠3a146cab-b85b-4dbd-9cd0-622c86442079︠
"""128.208.178.212
128.208.178.214
128.208.178.218
128.208.160.164
128.95.224.237
128.95.224.230
128.208.178.216
128.208.178.222
128.208.178.220
128.208.178.202
128.208.160.166
128.208.178.210
128.208.160.209
128.208.160.208
128.208.178.200
128.208.160.207
128.208.178.206
128.208.178.208
128.208.178.204""".splitlines()
︡2659eb8b-ad9c-4a7b-bb07-8c46054315ca︡{"stdout":"['128.208.178.212', '128.208.178.214', '128.208.178.218', '128.208.160.164', '128.95.224.237', '128.95.224.230', '128.208.178.216', '128.208.178.222', '128.208.178.220', '128.208.178.202', '128.208.160.166', '128.208.178.210', '128.208.160.209', '128.208.160.208', '128.208.178.200', '128.208.160.207', '128.208.178.206', '128.208.178.208', '128.208.178.204']\n"}︡
︠3e6534e1-e361-4f94-ae4f-d47a1126cdb9︠
for i in [1,2]+[4..7] + [10..21]:
    print "time rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud%s:/usr/local/sage/sage-6.5/"%i
︡7ed8682c-dfda-4137-95fd-aed19da84026︡{"stdout":"time rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud1:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud2:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud4:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud5:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud6:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud7:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud10:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud11:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud12:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud13:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud14:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud15:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud16:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud17:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud18:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud19:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud20:/usr/local/sage/sage-6.5/\ntime rsync -e 'ssh -p 2222' -axH sage-6.5/ cloud21:/usr/local/sage/sage-6.5/\n"}︡
︠9af7849b-91cf-417b-b28d-cff9466fe3f3︠
for x in """octave-audio - functions to work with audio files in Octave
octave-bim - PDE solver using a finite element/volume approach in Octave
octave-biosig - Octave bindings for BioSig library
octave-common - architecture-independent files for octave
octave-communications - communications package for Octave
octave-communications-common - communications package for Octave (arch-indep files)
octave-control - control functions for Octave from Octave-Forge
octave-data-smoothing - functions to do data smoothing on noisy data
octave-dataframe - manipulate data in Octave similar to R data.frame
octave-dbg - Debug symbols for octave
octave-doc - PDF documentation on the GNU Octave language
octave-econometrics - econometrics functions for Octave
octave-epstk - GNU Octave encapsulated postscript toolkit
octave-financial - financial manipulation and plotting functions
octave-fpl - plot data on unstructured triangular and tetrahedral meshes in Octave
octave-ga - genetic optimization code for Octave
octave-gdf - IO library for the GDF -- Octave interface
octave-general - provide extra general functions for Octave
octave-geometry - geometric computing functions for Octave
octave-gmt - Support of GMT grid files for Octave
octave-gsl - GSL binding for Octave
octave-htmldoc - HTML documentation on the GNU Octave language
octave-image - image manipulation for Octave
octave-info - GNU Info documentation on the GNU Octave language
octave-io - input/output data functions for Octave
octave-lhapdf - Octave Bindings for LHAPDF
octave-linear-algebra - additional linear-algebra functions for Octave
octave-miscellaneous - miscellaneous tools for Octave
octave-missing-functions - finds functions that are in Matlab but not in Octave
octave-mpi - Octave toolbox for parallel computing using MPI
octave-msh - create and manage meshes for FE or FV solvers in Octave
octave-nan - handles data with and without missing values in Octave
octave-nlopt - nonlinear optimization library -- GNU Octave package
octave-nurbs - non-uniform rational B-splines for Octave
octave-ocs - circuit simulator for Octave
octave-octcdf - NetCDF data files interface for Octave
octave-odepkg - solve differential equations and initial value problems in Octave
octave-openmpi-ext - Transitional package for parallel computing in Octave using MPI
octave-optim - unconstrained non-linear optimization toolkit for Octave
octave-optiminterp - optimal interpolation package for Octave
octave-parallel - parallel execution of Octave in clusters of computers
octave-pfstools - octave bindings for pfstools
octave-pkg-dev - infrastructure to build Octave packages
octave-psychtoolbox-3 - toolbox for vision research -- Octave bindings
octave-quaternion - quaternion package for Octave
octave-secs1d - semi conductor simulator in 1D for Octave
octave-secs2d - semi conductor simulator in 2D for Octave
octave-signal - signal processing functions for Octave
octave-sockets - communication through Internet sockets in Octave
octave-specfun - special mathematical functions for Octave
octave-splines - cubic spline functions for Octave
octave-statistics - additional statistical functions for Octave
octave-strings - additional string manipulation functions for Octave
octave-struct - additional structure manipulation functions for Octave
octave-sundials - SUNDIALS  for octave
octave-symbolic - symbolic package for Octave
octave-tsa - time series analysis in Octave
octave-vlfeat - Computer vision library focussing on visual features and clustering
octave-vrml - VRML functions for Octave
octave-zenity -""".splitlines():
    t = x.split(' - ')[0].strip()
    if 'msh' not in t and 'bim' not in t and 'secs1d' not in t:
        print t,
︡09dd652e-c4c5-41f5-9ceb-cd20b854ebcb︡{"stdout":"octave-audio octave-biosig octave-common octave-communications octave-communications-common octave-control octave-data-smoothing octave-dataframe octave-dbg octave-doc octave-econometrics octave-epstk octave-financial octave-fpl octave-ga octave-gdf octave-general octave-geometry octave-gmt octave-gsl octave-htmldoc octave-image octave-info octave-io octave-lhapdf octave-linear-algebra octave-miscellaneous octave-missing-functions octave-mpi octave-nan octave-nlopt octave-nurbs octave-ocs octave-octcdf octave-odepkg octave-openmpi-ext octave-optim octave-optiminterp octave-parallel octave-pfstools octave-pkg-dev octave-psychtoolbox-3 octave-quaternion octave-secs2d octave-signal octave-sockets octave-specfun octave-splines octave-statistics octave-strings octave-struct octave-sundials octave-symbolic octave-tsa octave-vlfeat octave-vrml octave-zenity -"}︡
︠58b1809e-708a-41d8-bbe9-ea3f919aa9f7︠
0.04*4000
︡128090e1-aae6-4b62-8fb6-f9df9419c4b4︡{"stdout":"160.000000000000\n"}︡
︠26e81ae7-dab4-40e0-96f9-3d1c3dbd4e4d︠
for i in [2,3]:
    print 'gcloud compute --project "sagemathcloud" instances create "gluster-us-%s" --zone "us-central1-f" --machine-type "n1-standard-1" --network "default" --maintenance-policy "MIGRATE" --scopes "https://www.googleapis.com/auth/devstorage.read_only" "https://www.googleapis.com/auth/logging.write" --image "https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-1410-utopic-v20150202" --boot-disk-type "pd-standard" --boot-disk-device-name "gluster-us-%s" & '%(i,i)



︡68cbc565-a2f5-469b-b68d-14f6c7e090f2︡{"stdout":"gcloud compute --project \"sagemathcloud\" instances create \"gluster-us-2\" --zone \"us-central1-f\" --machine-type \"n1-standard-1\" --network \"default\" --maintenance-policy \"MIGRATE\" --scopes \"https://www.googleapis.com/auth/devstorage.read_only\" \"https://www.googleapis.com/auth/logging.write\" --image \"https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-1410-utopic-v20150202\" --boot-disk-type \"pd-standard\" --boot-disk-device-name \"gluster-us-2\" & \ngcloud compute --project \"sagemathcloud\" instances create \"gluster-us-3\" --zone \"us-central1-f\" --machine-type \"n1-standard-1\" --network \"default\" --maintenance-policy \"MIGRATE\" --scopes \"https://www.googleapis.com/auth/devstorage.read_only\" \"https://www.googleapis.com/auth/logging.write\" --image \"https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-1410-utopic-v20150202\" --boot-disk-type \"pd-standard\" --boot-disk-device-name \"gluster-us-3\" & \n"}︡
︠0919e529-0d41-4489-a7ef-6ba8e148a4a1︠
for i in [1..8]:
    print 'gcloud compute --project "sage-math-inc" disks create "smc%sdc6-cassandra-ext4" --size "50" --zone "europe-west1-c" --type "pd-standard" & '%i
︡9ff2d4a6-82c0-4224-882b-f56d37ecbf44︡{"stdout":"gcloud compute --project \"sage-math-inc\" disks create \"smc1dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc2dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc3dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc4dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc5dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc6dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc7dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc8dc6-cassandra-ext4\" --size \"50\" --zone \"europe-west1-c\" --type \"pd-standard\" & \n"}︡
︠6a9fdb7b-605f-4816-bdb1-ecda0e54d991︠
for i in [1..8]:
    print 'gcloud compute --project "sage-math-inc" disks create "smc%sdc7-cassandra-ext4" --size "50" --zone "asia-east1-c" --type "pd-standard" & '%i
︡824d9f64-b022-460a-8701-2d4978cd8cad︡{"stdout":"gcloud compute --project \"sage-math-inc\" disks create \"smc1dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc2dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc3dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc4dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc5dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc6dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc7dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \ngcloud compute --project \"sage-math-inc\" disks create \"smc8dc7-cassandra-ext4\" --size \"50\" --zone \"asia-east1-c\" --type \"pd-standard\" & \n"}︡
︠86d8a0bd-aa45-46ee-a5f3-87664d206fd1︠
for i in [2..8]:
    print 'gcloud compute instances attach-disk  smc%sdc6 --disk smc%sdc6-cassandra-ext4 --zone europe-west1-c & '%(i,i)
︡a3995212-6253-4b8c-bd38-329aa7a396dd︡{"stdout":"gcloud compute instances attach-disk  smc2dc6 --disk smc2dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc3dc6 --disk smc3dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc4dc6 --disk smc4dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc5dc6 --disk smc5dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc6dc6 --disk smc6dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc7dc6 --disk smc7dc6-cassandra-ext4 --zone europe-west1-c & \ngcloud compute instances attach-disk  smc8dc6 --disk smc8dc6-cassandra-ext4 --zone europe-west1-c & \n"}︡
︠947f91c9-2155-443e-9807-0e7de5318d89︠
for i in [1..8]:
    print 'gcloud compute instances attach-disk  smc%sdc7 --disk smc%sdc7-cassandra-ext4 --zone asia-east1-c &'%(i,i)

︡4526bad1-1a20-417b-9185-a52503f2364a︡{"stdout":"gcloud compute instances attach-disk  smc1dc7 --disk smc1dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc2dc7 --disk smc2dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc3dc7 --disk smc3dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc4dc7 --disk smc4dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc5dc7 --disk smc5dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc6dc7 --disk smc6dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc7dc7 --disk smc7dc7-cassandra-ext4 --zone asia-east1-c &\ngcloud compute instances attach-disk  smc8dc7 --disk smc8dc7-cassandra-ext4 --zone asia-east1-c &\n"}︡
︠26b05c26-ca89-48fd-9211-1c61ea9c3a34︠
50 * 0.04
︡0bdc11ca-a535-4aa2-be81-729ea0f63319︡{"stdout":"2.00000000000000\n"}︡
︠0c7fb12d-3031-4ac1-9802-4666ced7a5df︠
24*16
︡8660b69b-4514-4551-ae78-d486aa05c790︡{"stdout":"384\n"}︡
︠e37865db-9d0c-472b-8de1-f0e35a4723d5︠
2+3
︡6a54d70b-0736-42ba-9ae4-0770b9eb8f4d︡{"stdout":"5\n"}︡
︠5702000d-db12-443d-b9e9-488784b71c36︠
 npm install commander start-stop-daemon winston primus ws sockjs engine.io cassandra-driver coffee-script node-uuid browserify@1.16.4 uglify-js2 passport passport-github express nodeunit validator async password-hash nodemailer cookies htmlparser mime pty.js posix mkdirp walk temp formidable@latest moment underscore read hashring rimraf net-ping marked node-sass http-proxy stripe
︠c9d4eb1c-b41b-4453-8d53-6b231f881457︠
60*60*24
︡a75197d5-0ad5-405a-8584-3d630239163d︡{"stdout":"86400\n"}︡
︠9f2f9d2e-bf43-45f8-b822-9259374e1fd4︠
s="""23.21.137.98
23.23.244.180
23.23.200.116
204.236.233.86
184.72.240.186
23.23.104.199
184.73.161.30
174.129.38.110
23.21.53.200
54.83.38.122
54.83.198.224
54.225.138.106
50.16.238.86
23.21.69.48
54.83.38.117
184.72.246.204
107.22.165.213
54.235.163.202
23.21.210.59
23.21.255.89
184.72.249.238
23.23.105.34
54.225.174.94
23.21.244.13
107.21.209.202
54.243.74.238
23.23.117.254
54.225.181.95
54.235.105.167
54.243.102.38
54.243.116.141
50.17.251.130
107.22.165.213
54.235.163.202
23.21.210.59
23.21.255.89
184.72.249.238
23.23.105.34
54.225.174.94"""
print '\n'.join(list(sorted(set(s.splitlines()))))

︡7d875b0e-f69c-49cb-8b70-5c95d1643f6c︡{"stdout":"107.21.209.202\n107.22.165.213\n174.129.38.110\n184.72.240.186\n184.72.246.204\n184.72.249.238\n184.73.161.30\n204.236.233.86\n23.21.137.98\n23.21.210.59\n23.21.244.13\n23.21.255.89\n23.21.53.200\n23.21.69.48\n23.23.104.199\n23.23.105.34\n23.23.117.254\n23.23.200.116\n23.23.244.180\n50.16.238.86\n50.17.251.130\n54.225.138.106\n54.225.174.94\n54.225.181.95\n54.235.105.167\n54.235.163.202\n54.243.102.38\n54.243.116.141\n54.243.74.238\n54.83.198.224\n54.83.38.117\n54.83.38.122\n"}︡
︠516d15b3-6eb3-4e10-9074-7f70dd101fb3︠
s = """\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}):
 \nmakedirs(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \n/usr/sbin/userdel 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/sbin/groupdel 83d4bc52d0984dbf8ccd46
a01c25627a\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \n/usr/sbin/groupadd -g 2011294958 -o 83d4bc52d0984dbf8ccd46a01c25627a\n(0.0507349967957 seconds): \n/usr/sbin/useradd -u 2011294958 -g 2011294958 -o
83d4bc52d0984dbf8ccd46a01c25627a -d /projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a -s /bin/bash\n(0.074981212616 seconds): \nkillall(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nkillall(project_id=83d4bc52-d098-4dbf-8
ccd-46a01c25627a,{}): killing all processes by user with id 2011294958\n/usr/bin/killall -u 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/bin/pkill -u 2011294958\n/usr/bin/killall -9 -u 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/bin/pkill
 -9 -u 2011294958\npgrep -u 2011294958\nkillall(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): kill attempt left 0 procs\nsettings(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nsettings(project_id=83d4bc52-d098-4
dbf-8ccd-46a01c25627a,{}): configuring account...\nzfs set userquota@2011294958=5000M bup/projects\n(0.00529003143311 seconds): \nzfs set userquota@2011294958=15000M bup/scratch\n(0.00501108169556 seconds): \ncgcreate -g memory
,cpu:83d4bc52d0984dbf8ccd46a01c25627a\n(0.00446200370789 seconds): \nensure_conf_files(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nensure_conf_files(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): ensure there i
s a bashrc and bash_profile\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nupdate_daemon_code(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c2562
7a,{}): \nmakedirs(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nrsync -zaxHL --update /home/salvus/salvus/salvus/local_hub_template// //projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a/.sagemathcloud/\n(0.252816915512 se
conds): \nchown 2011294958:2011294958 -R //projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a/.sagemathcloud/\n(0.227452993393 seconds): \nsu - 83d4bc52d0984dbf8ccd46a01c25627a -c 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc
'\nTraceback (most recent call last):\n  File \"/usr/local/bin/bup_storage.py\", line 1480, in <module>\n    args.func(args)\n  File \"/usr/local/bin/bup_storage.py\", line 1294, in <lambda>\n    parser_start.set_defaults(func=
lambda args: project.start())\n  File \"/usr/local/bin/bup_storage.py\", line 335, in start\n    self.start_daemons()\n  File \"/usr/local/bin/bup_storage.py\", line 294, in start_daemons\n    self.cmd(['su', '-', self.username
, '-c', 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc'], timeout=30)\n  File \"/usr/local/bin/bup_storage.py\", line 258, in cmd\n    return cmd(*args, **kwds)\n  File \"/usr/local/bin/bup_storage.py\", line 220, in cmd\
n    raise RuntimeError(x)\nRuntimeError:   File \"./start_smc\", line 17\n    print s\n          ^\nSyntaxError: invalid syntax\n\n"""
print s
︡aa7385c3-c869-402b-b343-47881f994176︡{"stdout":"\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}):\n \nmakedirs(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \n/usr/sbin/userdel 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/sbin/groupdel 83d4bc52d0984dbf8ccd46\na01c25627a\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \n/usr/sbin/groupadd -g 2011294958 -o 83d4bc52d0984dbf8ccd46a01c25627a\n(0.0507349967957 seconds): \n/usr/sbin/useradd -u 2011294958 -g 2011294958 -o\n83d4bc52d0984dbf8ccd46a01c25627a -d /projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a -s /bin/bash\n(0.074981212616 seconds): \nkillall(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nkillall(project_id=83d4bc52-d098-4dbf-8\nccd-46a01c25627a,{}): killing all processes by user with id 2011294958\n/usr/bin/killall -u 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/bin/pkill -u 2011294958\n/usr/bin/killall -9 -u 83d4bc52d0984dbf8ccd46a01c25627a\n/usr/bin/pkill\n -9 -u 2011294958\npgrep -u 2011294958\nkillall(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): kill attempt left 0 procs\nsettings(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nsettings(project_id=83d4bc52-d098-4\ndbf-8ccd-46a01c25627a,{}): configuring account...\nzfs set userquota@2011294958=5000M bup/projects\n(0.00529003143311 seconds): \nzfs set userquota@2011294958=15000M bup/scratch\n(0.00501108169556 seconds): \ncgcreate -g memory\n,cpu:83d4bc52d0984dbf8ccd46a01c25627a\n(0.00446200370789 seconds): \nensure_conf_files(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nensure_conf_files(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): ensure there i\ns a bashrc and bash_profile\ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nupdate_daemon_code(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \ncreate_home(project_id=83d4bc52-d098-4dbf-8ccd-46a01c2562\n7a,{}): \nmakedirs(project_id=83d4bc52-d098-4dbf-8ccd-46a01c25627a,{}): \nrsync -zaxHL --update /home/salvus/salvus/salvus/local_hub_template// //projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a/.sagemathcloud/\n(0.252816915512 se\nconds): \nchown 2011294958:2011294958 -R //projects/83d4bc52-d098-4dbf-8ccd-46a01c25627a/.sagemathcloud/\n(0.227452993393 seconds): \nsu - 83d4bc52d0984dbf8ccd46a01c25627a -c 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc\n'\nTraceback (most recent call last):\n  File \"/usr/local/bin/bup_storage.py\", line 1480, in <module>\n    args.func(args)\n  File \"/usr/local/bin/bup_storage.py\", line 1294, in <lambda>\n    parser_start.set_defaults(func=\nlambda args: project.start())\n  File \"/usr/local/bin/bup_storage.py\", line 335, in start\n    self.start_daemons()\n  File \"/usr/local/bin/bup_storage.py\", line 294, in start_daemons\n    self.cmd(['su', '-', self.username\n, '-c', 'cd .sagemathcloud; . sagemathcloud-env; ./start_smc'], timeout=30)\n  File \"/usr/local/bin/bup_storage.py\", line 258, in cmd\n    return cmd(*args, **kwds)\n  File \"/usr/local/bin/bup_storage.py\", line 220, in cmdn    raise RuntimeError(x)\nRuntimeError:   File \"./start_smc\", line 17\n    print s\n          ^\nSyntaxError: invalid syntax\n\n\n"}︡
︠8574f9d1-3cfc-45e0-8aca-d5aa29ef35de︠
for x in '0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc,  44468f71-5e2d-4685-8d60-95c9d703bea0, 806edbba-a66b-4710-9c65-47dd70503fc9, c2ba4efc-8b4d-4447-8b0b-6a512e1cac97, d0bfc232-beeb-4062-9ad5-439c794594f3,  eec826ad-f395-4a1d-bfb1-20f5a19d4bb0, f71dab5b-f40c-48db-a3d2-eefe6ec55f01'.split(', '):
    print "update storage_servers set health=1 where server_id = %s and dummy=true;"%x
︡ef690f1f-476e-494f-9985-8eff3dc1042d︡{"stdout":"update storage_servers set health=1 where server_id = 0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc and dummy=true;\nupdate storage_servers set health=1 where server_id =  44468f71-5e2d-4685-8d60-95c9d703bea0 and dummy=true;\nupdate storage_servers set health=1 where server_id = 806edbba-a66b-4710-9c65-47dd70503fc9 and dummy=true;\nupdate storage_servers set health=1 where server_id = c2ba4efc-8b4d-4447-8b0b-6a512e1cac97 and dummy=true;\nupdate storage_servers set health=1 where server_id = d0bfc232-beeb-4062-9ad5-439c794594f3 and dummy=true;\nupdate storage_servers set health=1 where server_id =  eec826ad-f395-4a1d-bfb1-20f5a19d4bb0 and dummy=true;\nupdate storage_servers set health=1 where server_id = f71dab5b-f40c-48db-a3d2-eefe6ec55f01 and dummy=true;\n"}︡
︠03db6ebe-da3e-4a34-93fd-89fabaf4037e︠

︠11ab8fc4-30a7-45fa-b54b-18325df6ce6b︠

︠74d178f8-d975-46df-9d7b-c4c5f34d117f︠
-2**63 + 1
︡ceb3dac1-fad0-464d-b217-88a2be512acc︡{"stdout":"-9223372036854775807\n"}︡
︠a494dbd3-1fb8-45d6-b39e-6b0d21d1cc5a︠
# This partitioner uses a maximum possible range of hash values from -2^63 to 2^63 -1
i = -2^63
b = 2^61
v = []
while i < 2^63-1:
    j = min(i+b,2^63-1)
    v.append([str(i),str(j)])
    #print [i, j]
    print "select project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=%s and token(project_id)<=%s limit 500000;"%(i,j)
    print "select count(*) from activity_by_project where token(project_id)>=%s and token(project_id)<=%s limit 500000;"%(i,j)
    i += b
print v
︡1a84cffa-a21b-4bcf-a70e-ce8a5321a5ab︡{"stdout":"select project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=-9223372036854775808 and token(project_id)<=-6917529027641081856 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=-9223372036854775808 and token(project_id)<=-6917529027641081856 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=-6917529027641081856 and token(project_id)<=-4611686018427387904 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=-6917529027641081856 and token(project_id)<=-4611686018427387904 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=-4611686018427387904 and token(project_id)<=-2305843009213693952 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=-4611686018427387904 and token(project_id)<=-2305843009213693952 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=-2305843009213693952 and token(project_id)<=0 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=-2305843009213693952 and token(project_id)<=0 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=0 and token(project_id)<=2305843009213693952 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=0 and token(project_id)<=2305843009213693952 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=2305843009213693952 and token(project_id)<=4611686018427387904 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=2305843009213693952 and token(project_id)<=4611686018427387904 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=4611686018427387904 and token(project_id)<=6917529027641081856 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=4611686018427387904 and token(project_id)<=6917529027641081856 limit 500000;\nselect project_id, timestamp, path, account_id from activity_by_project where token(project_id)>=6917529027641081856 and token(project_id)<=9223372036854775807 limit 500000;\nselect count(*) from activity_by_project where token(project_id)>=6917529027641081856 and token(project_id)<=9223372036854775807 limit 500000;\n"}︡{"stdout":"[['-9223372036854775808', '-6917529027641081856'], ['-6917529027641081856', '-4611686018427387904'], ['-4611686018427387904', '-2305843009213693952'], ['-2305843009213693952', '0'], ['0', '2305843009213693952'], ['2305843009213693952', '4611686018427387904'], ['4611686018427387904', '6917529027641081856'], ['6917529027641081856', '9223372036854775807']]\n"}︡
︠a71ec28b-1602-469a-bec3-ef8bf76ad36b︠

︠225490bc-116f-41da-ac43-8d8d42c7d6b0︠
(2^63- (-2^63+1))/10.
︡9764693c-83f0-433c-8fc4-a9d1fe42e60a︡{"stdout":"1.84467440737096e18\n"}︡
︠d3d99434-03b0-4a1b-bbd4-7d526df4e9b2︠
float(2^61)
︡eb6bd9af-4838-406b-9f76-0e7464899cf5︡{"stdout":"2.305843009213694e+18\n"}︡
︠b8dee739-76a4-4391-b476-148c6d321f92︠
[-2**63+1, -2**63+1+2^62, .., 2^63]
︡0a82d86f-cd56-4635-ab6a-6cc7086f0133︡{"stdout":"[]\n"}︡
︠40c2d87c-b854-417e-838e-ecbdefcd4cd3︠
0.04 * 2500
︡e41cc3ec-b6a3-4e97-921e-ef13624a4c8f︡{"stdout":"100.000000000000\n"}︡
︠664b63fc-0361-4b8e-ae45-eed969eecc1c︠
0.023 * 24*30
︡5c82967a-131c-422e-b3a3-0d5c2b7f6387︡{"stdout":"16.5600000000000\n"}︡
︠5770be9a-55b4-49ec-9e99-bbdda9e7d80b︠
14664/3.
︡e1a4cfb0-7ec4-4fc7-9a05-59c80dae6f83︡{"stdout":"4888.00000000000\n"}︡
︠7b087f3b-03e4-45ee-8809-934e1b86df8a︠
4888*12
︡93b87281-5e51-403c-a51a-7605d51a33fb︡{"stdout":"58656\n"}︡
︠29f809af-07b1-48f7-a26a-d6e775dc7a1d︠
80+80 + 360+360 + 1368 + 40 + 472+40+92+272+13
︡3f17f469-84af-450f-851b-6aa104376f7f︡{"stdout":"3177\n"}︡
︠ebabfef7-4ed7-463e-9689-e4dfdd0abbdb︠
3177*3.5
︡f16498c1-0ac7-4af6-bacd-5e91531843ce︡{"stdout":"11119.5000000000\n"}︡
︠0f05b47a-d437-49c7-8bc5-274e39fc5fc8︠
4000*.04
︡74ffe50c-cff2-4caf-ab07-6945d5f5e14d︡{"stdout":"160.000000000000\n"}︡
︠3dd31b94-b654-4c0a-b21c-ca86e7a28329︠
500*0.026
︡ba9b6366-eef1-4c9e-bb47-b503113600e7︡{"stdout":"13.0000000000000\n"}︡
︠61d70a3e-ee5e-4f7c-95fe-8e5adf513ff8︠
.17*1600
︡01f93fe4-20a0-48e2-81d9-0d54e726f679︡{"stdout":"272.000000000000\n"}︡
︠9b6b4e00-1963-472d-bb43-7e68f5fcd4df︠
0.04 * 11800
︡37e28c1e-ca2f-4d3f-9425-aca62224d782︡{"stdout":"472.000000000000\n"}︡
︠4b0b974c-aa7d-4287-ab18-baa74ec58bf2︠
0.053*24*31

︡bbb51d0b-a0b1-4d8a-99c6-00cdd80e497a︡{"stdout":"39.4320000000000\n"}︡
︠6ff08bc8-3b57-49f1-beba-61d74613f775︠
0.13 * 24 * 31

︡1b91f567-ce97-4b6c-b1da-4eb160117588︡{"stdout":"96.7200000000000\n"}︡
︠b335e0f9-47db-4d54-952a-f5487478e922︠
8*171
︡582798c8-5404-4f8c-9e3e-50cd77d32e58︡{"stdout":"1368\n"}︡
︠f40ce98c-104c-409f-b150-0ade2d8ed0d7︠

︠e9ea1812-22c4-4e26-9f26-97ba9f1700e5︠
for i in [1..7]:
    print "time ls -lt --time-style=full-iso 10.1.%s.5 |grep -v ^total > ls-lt/10.1.%s.5"%(i,i)
︡c1dfe3bf-0ebb-4dbb-86bd-4bb8b3e7cd3e︡{"stdout":"time ls -lt --time-style=full-iso 10.1.1.5 |grep -v ^total > ls-lt/10.1.1.5\ntime ls -lt --time-style=full-iso 10.1.2.5 |grep -v ^total > ls-lt/10.1.2.5\ntime ls -lt --time-style=full-iso 10.1.3.5 |grep -v ^total > ls-lt/10.1.3.5\ntime ls -lt --time-style=full-iso 10.1.4.5 |grep -v ^total > ls-lt/10.1.4.5\ntime ls -lt --time-style=full-iso 10.1.5.5 |grep -v ^total > ls-lt/10.1.5.5\ntime ls -lt --time-style=full-iso 10.1.6.5 |grep -v ^total > ls-lt/10.1.6.5\ntime ls -lt --time-style=full-iso 10.1.7.5 |grep -v ^total > ls-lt/10.1.7.5\n"}︡
︠dc01396f-f097-48b0-b17f-1c7a493bb679︠
s="""ssd@0                   0      -   136K  -
ssd@1                   0      -   136K  -
ssd@2                   0      -   136K  -
ssd@3                   0      -   136K  -
ssd@4                   0      -   136K  -
ssd/cassandra4@0    95.5M      -  24.4G  -
ssd/cassandra4@1    1016M      -  25.9G  -
ssd/cassandra4@2     108M      -  26.4G  -
ssd/cassandra4@3    70.0M      -  26.5G  -
ssd/cassandra4@4    1015M      -  26.7G  -
ssd/compute4dc1@0    262M      -   204G  -
ssd/compute4dc1@1    385M      -   205G  -
ssd/compute4dc1@2   45.0M      -   206G  -
ssd/compute4dc1@3   3.25M      -   206G  -
ssd/compute4dc1@4    248M      -   206G  -
ssd/images/base3@0   108K      -  70.6G  -
"""
for a in s.splitlines():
    if '@' in a:
        print "zfs destroy %s"%a.split()[0]
︡7f5004cf-f557-4120-9dba-1a84ae754b13︡{"stdout":"zfs destroy ssd@0\nzfs destroy ssd@1\nzfs destroy ssd@2\nzfs destroy ssd@3\nzfs destroy ssd@4\nzfs destroy ssd/cassandra4@0\nzfs destroy ssd/cassandra4@1\nzfs destroy ssd/cassandra4@2\nzfs destroy ssd/cassandra4@3\nzfs destroy ssd/cassandra4@4\nzfs destroy ssd/compute4dc1@0\nzfs destroy ssd/compute4dc1@1\nzfs destroy ssd/compute4dc1@2\nzfs destroy ssd/compute4dc1@3\nzfs destroy ssd/compute4dc1@4\nzfs destroy ssd/images/base3@0\n"}︡
︠7164a246-4ee7-4755-8811-11040f6de1f0︠

︠032f34ab-c7b8-40de-bef4-8167df716d60︠
for i in [1..8]:
    print "scp smc_gce_web*dc2 10.3.%s.5:salvus/salvus/conf/tinc_hosts/"%i
︡8795f1b6-1b71-4b2f-bd18-601d1ffb32f8︡{"stdout":"scp smc_gce_web*dc2 10.3.1.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.2.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.3.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.4.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.5.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.6.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.7.5:salvus/salvus/conf/tinc_hosts/\nscp smc_gce_web*dc2 10.3.8.5:salvus/salvus/conf/tinc_hosts/\n"}︡
︠b754aab3-bfc3-48a2-8bbe-326d153cd458︠
for i in [4..7]+[10..21]:
    print 'echo %s; ssh cassandra%s "cd salvus/salvus; . salvus-env; time nodetool upgradesstables"'%(i,i)
for i in [1..4]:
    print 'echo %s; ssh cassandra%sdc2 "cd salvus/salvus; . salvus-env; time nodetool upgradesstables"'%(i,i)
for i in [1..4]:
    print 'echo %s; ssh cassandra%sdc3 "cd salvus/salvus; . salvus-env; time nodetool upgradesstables"'%(i,i)
︡0165a3bc-2e2b-4987-8e88-3f3f1cb9a0c3︡{"stdout":"echo 4; ssh cassandra4 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 5; ssh cassandra5 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 6; ssh cassandra6 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 7; ssh cassandra7 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 10; ssh cassandra10 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 11; ssh cassandra11 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 12; ssh cassandra12 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 13; ssh cassandra13 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 14; ssh cassandra14 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 15; ssh cassandra15 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 16; ssh cassandra16 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 17; ssh cassandra17 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 18; ssh cassandra18 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 19; ssh cassandra19 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 20; ssh cassandra20 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 21; ssh cassandra21 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\n"}︡{"stdout":"echo 1; ssh cassandra1dc2 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 2; ssh cassandra2dc2 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 3; ssh cassandra3dc2 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 4; ssh cassandra4dc2 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\n"}︡{"stdout":"echo 1; ssh cassandra1dc3 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 2; ssh cassandra2dc3 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 3; ssh cassandra3dc3 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\necho 4; ssh cassandra4dc3 \"cd salvus/salvus; . salvus-env; time nodetool upgradesstables\"\n"}︡
︠203940d3-25f8-4377-8eae-0a4e676329a7︠
a="""{-1: '23.251.157.130', 2: '10.240.42.225', 3: '10.240.42.225', 4: '10.240.42.225'}
         {-1: '23.236.49.245', 2: '10.240.9.148', 3: '10.240.9.148', 4: '10.240.9.148'}
  {-1: '23.251.156.150', 2: '10.240.100.223', 3: '10.240.100.223', 4: '10.240.100.223'}
     {-1: '162.222.176.40', 2: '10.240.147.57', 3: '10.240.147.57', 4: '10.240.147.57'}
 {-1: '162.222.182.154', 2: '10.240.205.242', 3: '10.240.205.242', 4: '10.240.205.242'}
       {-1: '23.236.49.76', 2: '10.240.76.228', 3: '10.240.76.228', 4: '10.240.76.228'}
  {-1: '162.222.183.50', 2: '10.240.177.183', 3: '10.240.177.183', 4: '10.240.177.183'}
  {-1: '199.223.234.31', 2: '10.240.120.226', 3: '10.240.120.226', 4: '10.240.120.226'}"""
import json
for x in a.splitlines():
    target = eval(x)[2]
    print "echo %s; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ %s:/usr/local/sage/"%(target, target)
︡4f297274-f614-4c2f-8b75-7ff82d95ec1f︡{"stdout":"echo 10.240.42.225; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.42.225:/usr/local/sage/\necho 10.240.9.148; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.9.148:/usr/local/sage/\necho 10.240.100.223; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.100.223:/usr/local/sage/\necho 10.240.147.57; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.147.57:/usr/local/sage/\necho 10.240.205.242; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.205.242:/usr/local/sage/\necho 10.240.76.228; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.76.228:/usr/local/sage/\necho 10.240.177.183; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.177.183:/usr/local/sage/\necho 10.240.120.226; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no' /usr/local/sage/ 10.240.120.226:/usr/local/sage/\n"}︡
︠401dcc32-9a5c-4265-9768-1db5a621fc36︠
a="""{-1: '128.208.178.212:2222'}
 {-1: '128.208.178.214:2222'}
 {-1: '128.208.178.218:2222'}
 {-1: '128.208.178.216:2222'}
 {-1: '128.208.178.222:2222'}
 {-1: '128.208.178.220:2222'}
 {-1: '128.208.178.202:2222'}
 {-1: '128.208.178.210:2222'}
 {-1: '128.208.178.200:2222'}
 {-1: '128.208.178.206:2222'}
 {-1: '128.208.178.208:2222'}
 {-1: '128.208.178.204:2222'}
 {-1: '128.208.160.164:2222'}
  {-1: '128.95.224.237:2222'}
  {-1: '128.95.224.230:2222'}
 {-1: '128.208.160.166:2222'}
 {-1: '128.208.160.209:2222'}
 {-1: '128.208.160.208:2222'}
 {-1: '128.208.160.207:2222'}
"""
import json
for x in a.splitlines():
    target = eval(x)[-1].split(":")[0]
    print "echo %s; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ %s:/usr/local/sage/stein-watkins-ecdb/"%(target, target)

︡6769e55b-8f20-4e0f-957e-137b6ca38576︡{"stdout":"echo 128.208.178.212; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.212:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.214; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.214:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.218; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.218:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.216; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.216:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.222; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.222:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.220; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.220:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.202; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.202:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.210; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.210:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.200; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.200:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.206; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.206:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.208; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.208:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.178.204; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.178.204:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.160.164; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.160.164:/usr/local/sage/stein-watkins-ecdb/\necho 128.95.224.237; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.95.224.237:/usr/local/sage/stein-watkins-ecdb/\necho 128.95.224.230; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.95.224.230:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.160.166; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.160.166:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.160.209; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.160.209:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.160.208; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.160.208:/usr/local/sage/stein-watkins-ecdb/\necho 128.208.160.207; time rsync -axH --delete -e 'ssh -o StrictHostKeyChecking=no -p 2222' /usr/local/sage/stein-watkins-ecdb/ 128.208.160.207:/usr/local/sage/stein-watkins-ecdb/\n"}︡
︠5bd34f10-900f-4065-bc14-cd649f2c59e6︠

︠7c3c3717-8dec-4a6c-bc3a-95e48a3bb259︠
274+269+224+280+346+299+310
︡c57770a7-bbed-41ed-9aae-a5bb0104d271︡{"stdout":"2002\n"}︡
︠24893b25-e180-4887-9045-6a4f8430af84︠
2591974/60/60.0/24.
︡cd374797-0f4f-42b3-992b-fa47371351c3︡{"stdout":"29.9996990740741\n"}︡
︠44c573a6-59bc-4be7-a25f-b32aee030ad7︠
%coffeescript
print CodeMirror.version
︡1696b9c1-b3cd-4f98-8246-1952b4dbc0db︡{"javascript":{"coffeescript":true,"code":"print CodeMirror.version\n"}}︡
︠a177b784-ab32-4081-8e44-b37c5b592536︠

︠f4cefcb7-b073-4796-a1d0-9098c920275e︠
%sh
cd salvus
git status
︡5a312701-785b-42fd-a651-4a4e1b134e49︡{"stdout":"/bin/bash: line 1: cd: salvus: No such file or directory\n# On branch master\n# Changes not staged for commit:\n#   (use \"git add <file>...\" to update what will be committed)\n#   (use \"git checkout -- <file>...\" to discard changes in working directory)\n#\n#\tmodified:   ../.gitignore\n#\tmodified:   smc.tasks\n#\n# Untracked files:\n#   (use \"git add <file>...\" to include in what will be committed)\n#\n#\t../doc/notes.md\n#\t2013-07-19-203035\n#\t2014-05-todo-planning/\n#\t2014-08-13-164242.sagews\n#\t2014-10-05-170019-scratch.md\n#\tdeleted.md\n#\tmar2014b.md\n#\tscratch.sagews\n#\tsmc.tasks.0\n#\t../salvus/.snapshot/\n#\t../salvus/conf/deploy_cloud/storage-tinc/\n#\t../salvus/cqlsh_connect\n#\t../salvus/help.html\n#\t../salvus/page/tasks.coffeee\n#\t../salvus/push_to_storm\n#\t../salvus/reset_password.coffee\n#\t../salvus/scratch.coffee\n#\t../salvus/scratch.md\n#\t../salvus/scripts/create_storage_user.py\n#\t../salvus/scripts/delete_snapshots.py\n#\t../salvus/scripts/img_to_zvol.py\n#\t../salvus/scripts/storage-topology\n#\t../salvus/scripts/supersage.py\n#\t../salvus/scripts/tmp\n#\t../salvus/scripts/zpool_storage.py\n#\t../salvus/src/get-pip.py\n#\t../salvus/static/jquery/plugins/dropzone.backup/\nno changes added to commit (use \"git add\" and/or \"git commit -a\")\n"}︡
︠63c21a69-4cf2-4638-b113-271e93661abd︠
/bin/bash: line 1: cd: salvus: No such file or directory
# On branch master
# Changes not staged for commit:
#   (use "git add <file>..." to update what will be committed)
#   (use "git checkout -- <file>..." to discard changes in working directory)
#
#	modified:   smc.tasks
#
# Untracked files:
#   (use "git add <file>..." to include in what will be committed)
#
#	../doc/notes.md
#	../doc/user.aux
#	../doc/user.out
#	../doc/user.pdf
#	../doc/user.synctex.gz
#	../doc/user.toc
#	2013-05-28-160434.term
#	2013-07-19-203035
#	20130507_1321.term
#	2014-05-todo-planning/
#	2014-08-13-164242.sagews
#	2014-10-05-170019-scratch.md
#	deleted.md
#	devel.term
#	mar2014b.md
#	monitor.term
#	scratch.sagews
#	smc.tasks.0
#	../salvus/.snapshot/
#	../salvus/2013-07-17-112200.term
#	../salvus/conf/deploy_cloud/storage-tinc/
#	../salvus/cqlsh_connect
#	../salvus/help.html
#	../salvus/page/tasks.coffeee
#	../salvus/push_to_storm
#	../salvus/reset_password.coffee
#	../salvus/scratch.coffee
#	../salvus/scratch.md
#	../salvus/scripts/create_storage_user.py
#	../salvus/scripts/delete_snapshots.py
#	../salvus/scripts/img_to_zvol.py
#	../salvus/scripts/storage-topology
#	../salvus/scripts/supersage.py
#	../salvus/scripts/tmp
#	../salvus/scripts/zpool_storage.py
#	../salvus/src/get-pip.py
#	../salvus/static/jquery/plugins/dropzone.backup/
no changes added to commit (use "git add" and/or "git commit -a")
︠31f2d765-409d-49da-835d-1bb78419fee8︠

︠fc8e8080-c323-4827-8862-89765cb02b2f︠
for n in [1..7]+[10..21]:
    print "ssh cloud%s -p 2222 hostname"%n
︡fc8f61a5-b350-46ef-ba02-c4c2c13dab7e︡{"stdout":"ssh cloud1 -p 2222 hostname\nssh cloud2 -p 2222 hostname\nssh cloud3 -p 2222 hostname\nssh cloud4 -p 2222 hostname\nssh cloud5 -p 2222 hostname\nssh cloud6 -p 2222 hostname\nssh cloud7 -p 2222 hostname\nssh cloud10 -p 2222 hostname\nssh cloud11 -p 2222 hostname\nssh cloud12 -p 2222 hostname\nssh cloud13 -p 2222 hostname\nssh cloud14 -p 2222 hostname\nssh cloud15 -p 2222 hostname\nssh cloud16 -p 2222 hostname\nssh cloud17 -p 2222 hostname\nssh cloud18 -p 2222 hostname\nssh cloud19 -p 2222 hostname\nssh cloud20 -p 2222 hostname\nssh cloud21 -p 2222 hostname\n"}︡
︠cd881391-ad04-4bd2-944b-2de21cf60a93︠
1112+300
︡6a5bee01-a5bc-4f48-b870-144b0568c01e︡{"stdout":"1412\n"}︡
︠1db8884a-7d60-4a26-a8fd-87ec60f4ddd2︠
R.<x> = QQ[]
f = R(0)
︡e174ae25-87b7-4274-bab0-78fce089fc32︡
︠caeae67a-2e88-4153-8ee7-e2a418045f39︠
f.degree()
︡7e14d1c4-d63a-46bc-8ed9-0f95a8440c58︡{"stdout":"-1\n"}︡
︠6d68c1d1-e5bd-49bd-a36b-3e46996fa7f2︠
valuation(0,3)
︡332b1ecd-9edc-426f-a45a-7b94a40c7964︡{"stdout":"+Infinity\n"}︡
︠137612ef-c108-4326-91ce-639533c8ef1b︠
2+3
︡1e39ed8b-f176-4326-b2a1-d9409feaf0b7︡{"stdout":"5\n"}︡
︠a75fcdf9-62a8-4036-8808-598b1c824b55︠
%scilab
2+3
︡9fe867d2-72fe-4cf7-bb20-a1851cf2d002︡{"stdout":"\u001b[4l \b\u001b[0m ans  =\n \n    5."}︡
︠750e1fe5-6faf-4282-aef1-449b1529c5da︠
2+30
︡50125805-916f-4b62-9f3d-6b14217cee04︡{"stdout":"32\n"}︡
︠2a547ac1-490b-473b-bc72-9b0bb1c590b2︠
x = polygen(GF(7))
k.<a> = GF(7, modulus=x-2)
type(k)
︡375ba57a-2ae7-48d6-9a07-05a5080cb550︡{"stdout":"<class 'sage.rings.finite_rings.finite_field_prime_modn.FiniteField_prime_modn_with_category'>\n"}︡
︠d14efc8f-c647-4f79-a44a-dbf8fc6ee0a8︠
k = GF(7)
k.gen?
︡f56b57c6-99c2-43a7-8ff4-5cedf48f8696︡{"stdout":"   File: /usr/local/sage/sage-6.3.beta6/local/lib/python2.7/site-packages/sage/rings/finite_rings/finite_field_prime_modn.py\n   Docstring:\n      Return a generator of \"self\" over its prime field.\n\n   This always returns 1.\n\n   Note: If you want a primitive element for this finite field instead,\n     use \"multiplicative_generator()\".\n\n   EXAMPLES:\n\n      sage: k = GF(13)\n      sage: k.gen()\n      1\n      sage: k.gen(1)\n      Traceback (most recent call last):\n      ...\n      IndexError: only one generator\n"}︡{"stdout":"\n"}︡
︠08910de7-f8d1-4cc3-a245-26dc334a96e6︠
544-238
︡639aec37-afa2-4aee-920a-0ab5acd579a4︡{"stdout":"306\n"}︡
︠bf03eb93-0dcf-49e7-ba68-792baf0b02be︠
503-227
︡9f94c35c-ef46-4c88-a003-431f03d3ff70︡{"stdout":"276\n"}︡
︠84575edb-ea26-4985-8251-7d5026c2009e︠
0.180*24*31
︡021e96d5-c5d2-4b3f-85f1-2b1fb0dfdda3︡{"stdout":"133.920000000000"}︡{"stdout":"\n"}︡
︠6c13768c-afd4-4b1a-a6d9-aa83255209b6︠
graphs.PetersenGraph().clique_number(algorithm="mcqd")
︡9ab7b118-95b8-4114-bf42-c46e0c26353b︡{"stderr":"Error in lines 2-2\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 736, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"/usr/local/sage/sage-6.3.beta6/local/lib/python2.7/site-packages/sage/graphs/graph.py\", line 5420, in clique_number\n    raise ImportError(\"Please install the mcqd package\")\nImportError: Please install the mcqd package\n"}︡
︠6a5be7ed-4d9e-4972-8b40-b44ee65133bd︠
h = lambda x: zeta(2*x)*(4^x-2)
A = lambda n: Integer((h((n+1)//2)*h(n//2)/h(n)).denominator())
ecm.factor(A(34))
︡dc8eb9a8-a332-4ed9-8e57-11c34ac4200d︡{"stdout":"[101, 123143, 193707721, 1822329343, 761838257287, 5525473366510930028227481]"}︡{"stdout":"\n"}︡
︠263d78b1-87e5-476d-8861-984533fecee5︠

︠f21fa395-c25c-4e07-a337-3bf90fe289a1︠
' '.join(['cloud%s'%i for i in range(1,8)+range(10,22)])
︡ed481c4f-12bd-43db-a6f2-e6ac9f901197︡{"stdout":"'cloud1 cloud2 cloud3 cloud4 cloud5 cloud6 cloud7 cloud10 cloud11 cloud12 cloud13 cloud14 cloud15 cloud16 cloud17 cloud18 cloud19 cloud20 cloud21'\n"}︡
︠074d7226-b4f9-40d2-a19b-1b6930e08bce︠
try:
    sleep(10)
except Exception, msg:
    print msg
︠0e71fd7d-f302-462d-8e92-8cb02504e135︠
@interact
def f(c=Color('red')):
    print c
︡77533c11-aa45-41b6-a9a4-7d4da90145df︡{"interact":{"style":"None","flicker":false,"layout":[[["c",12,null]],[["",12,null]]],"id":"827b7347-cbf7-4b65-bb58-12927556e94c","controls":[{"widget":null,"control_type":"color-selector","hide_box":false,"Color":"<class 'sage.plot.colors.Color'>","label":"c","default":"#ff0000","readonly":false,"var":"c"}]}}︡
︠7544bfb9-977e-4ec4-bb97-f3e4f1caf26d︠
Database schema:

    alter table accounts add groups  set<varchar>;
    alter table projects add hide_from_accounts set<uuid>;
    alter table accounts add hidden_projects    set<uuid>;


Node:

       npm install nodemailer

︠17904dd2-5974-44ac-b602-a3ef87ac30c6︠

︠63c7ea3f-9461-4916-a48e-b0160fe95192︠

︠7108b9cb-47d2-40d0-b69c-2d2314a07e60︠
@interact
def f(n=(1..100)):
    print n
︡dfc3d56c-b01c-45bd-b685-8ae33eb74368︡{"interact":{"style":"None","flicker":false,"layout":[[["n",12,null]],[["",12,null]]],"id":"fc6bcd4a-78dd-499d-a60d-c6528aabb33a","controls":[{"control_type":"slider","default":0,"var":"n","width":null,"vals":["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63","64","65","66","67","68","69","70","71","72","73","74","75","76","77","78","79","80","81","82","83","84","85","86","87","88","89","90","91","92","93","94","95","96","97","98","99","100"],"animate":true,"label":"n","display_value":true}]}}︡
︠ec379baf-779a-48cc-91dc-df799624c1f8︠
https://128.208.160.164
https://128.208.178.200
https://128.208.178.222
https://128.208.160.209

︠c5f6f3b4-4244-40f5-812f-4701913ed31e︠
factor(7056)
︡4743cc3f-74b2-4c0d-9b6f-305a080cbe0e︡{"stdout":"2^4 * 3^2 * 7^2\n"}︡
︠5fbf7384-c2b1-43d3-8d9e-a4ac04382a06︠
dimension_new_cusp_forms(7056,2)
︡0d5913b9-f63d-4ab2-a67d-a1222703937a︡{"stdout":"100\n"}︡
︠f76ac835-d891-4941-a7c3-7e503f8139da︠
%md

This book is a sort of "Missing Manual" that explains how Sage can be used in
a range of standard mathematics courses, instead of targeting specialists
like much existing Sage documentation.  The depth of content is very impressive,
and describes---in a single coherent narrative---how to successfully use Sage
for a wide swath of undergraduate applied topics.



︠2dcde6cf-6bbf-48e9-933f-93b4a8687b7d︠
        rjava.c:52:7: warning: ignoring return value of ‘read’, declared with attribute warn_unused_result [-Wunused-result]
           read(resin, buf, sizeof(ptrlong) * 2);
               ^
        Rcallbacks.c:9:36: fatal error: org_rosuda_JRI_Rengine.h: No such file or directory
         #include "org_rosuda_JRI_Rengine.h"
                                            ^
        compilation terminated.
        Rcallbacks.c:9:36: fatal error: org_rosuda_JRI_Rengine.h: No such file or directory
         #include "org_rosuda_JRI_Rengine.h"
                                            ^
        compilation terminated.
        make[2]: *** [Rcallbacks.o] Error 1

So I'm guessing, based on http://r.789695.n4.nabble.com/rJava-Error-td4634572.html, that I would have to change how R is built in Sage to have the --enable-R-shlib  option.   Of course, if things worked for you, then maybe I'm doing something else wrong?

I also tried setting the LD_LIBRARY_PATH and running "R CMD javareconf -e", but that doesn't seem to make any difference.

︠2ca06527-c08b-4292-86be-b931fbfdd76e︠
cloud10  {'hostname':'compute10dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute10dc0', 'vnc':13100}
cloud11  {'hostname':'compute11dc0',  'vcpus':compute_cpu,   'ram':compute_ram_med, 'base':base, 'disk':'/dev/zvol/ssd/compute11dc0', 'vnc':13100}
cloud12  {'hostname':'compute12dc0',  'vcpus':compute_cpu,   'ram':compute_ram_med, 'base':base, 'disk':'/dev/zvol/ssd/compute12dc0', 'vnc':13100}
cloud13  {'hostname':'compute13dc0',  'vcpus':compute_cpu,   'ram':compute_ram_med, 'base':base, 'disk':'/dev/zvol/ssd/compute13dc0', 'vnc':13100}
cloud14  {'hostname':'compute14dc0',  'vcpus':compute_cpu,   'ram':compute_ram_med, 'base':base, 'disk':'/dev/zvol/ssd/compute14dc0', 'vnc':13100}
cloud15  {'hostname':'compute15dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute15dc0', 'vnc':13100}
cloud16  {'hostname':'compute16dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute16dc0', 'vnc':13100}
cloud17  {'hostname':'compute17dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute17dc0', 'vnc':13100}
cloud18  {'hostname':'compute18dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute18dc0', 'vnc':13100}
cloud19  {'hostname':'compute19dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute19dc0', 'vnc':13100}
cloud20  {'hostname':'compute20dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute20dc0', 'vnc':13100}
cloud21  {'hostname':'compute21dc0',  'vcpus':compute_cpu,   'ram':compute_ram,     'base':base, 'disk':'/dev/zvol/ssd/compute21dc0', 'vnc':13100}
︠5a76738f-d43c-42b2-8300-2c8e92ce5170︠
cloud10   {'hostname':'cassandra10', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra10', 'vnc':13200}
cloud11   {'hostname':'cassandra11', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra11', 'vnc':13200}
cloud12   {'hostname':'cassandra12', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra12', 'vnc':13200}
cloud13   {'hostname':'cassandra13', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra13', 'vnc':13200}
cloud14   {'hostname':'cassandra14', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra14', 'vnc':13200}
cloud15   {'hostname':'cassandra15', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra15', 'vnc':13200}
cloud16   {'hostname':'cassandra16', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra16', 'vnc':13200}
cloud17   {'hostname':'cassandra17', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra17', 'vnc':13200}
cloud18   {'hostname':'cassandra18', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra18', 'vnc':13200}
cloud19   {'hostname':'cassandra19', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra19', 'vnc':13200}
cloud20   {'hostname':'cassandra20', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra20', 'vnc':13200}
cloud21   {'hostname':'cassandra21', 'vcpus':cassandra_cpu, 'ram':cassandra_ram, 'base':base, 'disk':'/dev/zvol/ssd/cassandra21', 'vnc':13200}
︠cef05318-7f57-4ce7-afba-d153aa928c53︠
[cloud.stop('vm',hostname=s%i,wait=False) for i in range(10,22) for s in ['compute%sdc0', 'compute%sdc0b']]
︡7b914a75-9330-4cc7-9b6d-d76a07fee7e2︡{"stderr":"Error in lines 1-1\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 736, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\nNameError: name 'cloud' is not defined\n"}︡
︠117eb511-453b-4bfb-aeeb-eabaf489dc30︠
[cloud.start('vm',hostname=s%i,wait=False) for i in range(11,22) for s in ['compute%sdc0', 'compute%sdc0b', 'cassandra%s', 'cassandra%sb', 'web%s']]
︠65215a66-5844-496c-b91a-523f1b70b1dd︠
for i in [10..21]:
    print "cloud%s    {'hostname':'compute%sdc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute%sdc0', 'vnc':13505}"%(i,i,i)
    print "cloud%s    {'hostname':'cassandra%sb',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra%s',  'vnc':13502}"%(i,i,i)
︡959e063c-ca72-4f90-919c-4e9fe6cfac00︡{"stdout":"cloud10    {'hostname':'compute10dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute10dc0', 'vnc':13505}\ncloud10    {'hostname':'cassandra10b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra10',  'vnc':13502}\ncloud11    {'hostname':'compute11dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute11dc0', 'vnc':13505}\ncloud11    {'hostname':'cassandra11b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra11',  'vnc':13502}\ncloud12    {'hostname':'compute12dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute12dc0', 'vnc':13505}\ncloud12    {'hostname':'cassandra12b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra12',  'vnc':13502}\ncloud13    {'hostname':'compute13dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute13dc0', 'vnc':13505}\ncloud13    {'hostname':'cassandra13b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra13',  'vnc':13502}\ncloud14    {'hostname':'compute14dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute14dc0', 'vnc':13505}\ncloud14    {'hostname':'cassandra14b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra14',  'vnc':13502}\ncloud15    {'hostname':'compute15dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute15dc0', 'vnc':13505}\ncloud15    {'hostname':'cassandra15b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra15',  'vnc':13502}\ncloud16    {'hostname':'compute16dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute16dc0', 'vnc':13505}\ncloud16    {'hostname':'cassandra16b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra16',  'vnc':13502}\ncloud17    {'hostname':'compute17dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute17dc0', 'vnc':13505}\ncloud17    {'hostname':'cassandra17b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra17',  'vnc':13502}\ncloud18    {'hostname':'compute18dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute18dc0', 'vnc':13505}\ncloud18    {'hostname':'cassandra18b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra18',  'vnc':13502}\ncloud19    {'hostname':'compute19dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute19dc0', 'vnc':13505}\ncloud19    {'hostname':'cassandra19b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra19',  'vnc':13502}\ncloud20    {'hostname':'compute20dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute20dc0', 'vnc':13505}\ncloud20    {'hostname':'cassandra20b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra20',  'vnc':13502}\ncloud21    {'hostname':'compute21dc0b', 'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/compute21dc0', 'vnc':13505}\ncloud21    {'hostname':'cassandra21b',  'vcpus':1, 'ram':4, 'base':base, 'disk':'/dev/zvol/ssd/cassandra21',  'vnc':13502}\n"}︡
︠625a99ed-0ca2-4d8f-a876-0f01c49ebacb︠
for i in [11..21]:
    print "10.1.%s.22 cassandra%sb\n10.1.%s.55 compute%sdc0b"%(i,i,i,i)
︡29c0576d-1bbe-4de8-8ce9-b0d69c2121a3︡{"stdout":"10.1.11.22 cassandra11b\n10.1.11.55 compute11dc0b\n10.1.12.22 cassandra12b\n10.1.12.55 compute12dc0b\n10.1.13.22 cassandra13b\n10.1.13.55 compute13dc0b\n10.1.14.22 cassandra14b\n10.1.14.55 compute14dc0b\n10.1.15.22 cassandra15b\n10.1.15.55 compute15dc0b\n10.1.16.22 cassandra16b\n10.1.16.55 compute16dc0b\n10.1.17.22 cassandra17b\n10.1.17.55 compute17dc0b\n10.1.18.22 cassandra18b\n10.1.18.55 compute18dc0b\n10.1.19.22 cassandra19b\n10.1.19.55 compute19dc0b\n10.1.20.22 cassandra20b\n10.1.20.55 compute20dc0b\n10.1.21.22 cassandra21b\n10.1.21.55 compute21dc0b\n"}︡
︠6e68b7aa-f93b-44e3-819b-a3f740d96d10︠
' '.join(['cloud%s'%i for i in [14..21]])
︡640b6cc2-03b3-4675-a4ba-c65a0eff41a9︡{"stdout":"'cloud14 cloud15 cloud16 cloud17 cloud18 cloud19 cloud20 cloud21'\n"}︡
︠fa387927-939c-4e89-bc6b-d55629bd8388︠
4178.93/163
︡b069cf17-caaa-4b3c-8975-cee15ab56c18︡{"stdout":"25.6376073619632\n"}︡
︠fb38fe53-992d-4b90-8b5a-85c1f75d1bd4︠
servers="""0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc |  2 |  10.3.6.5 |    0.75
 0985aa3e-c5e9-400e-8faa-32e7d5399dab |  0 | 10.1.16.5 |       1
 2d7f86ce-14a3-41cc-955c-af5211f4a85e |  0 | 10.1.17.5 |       1
 3056288c-a78d-4f64-af21-633214e845ad |  0 | 10.1.19.5 |       1
 306ad75d-ffe0-43a4-911d-60b8cd133bc8 |  1 |  10.1.1.5 |       0
 44468f71-5e2d-4685-8d60-95c9d703bea0 |  2 |  10.3.8.5 |       1
 4e4a8d4e-4efa-4435-8380-54795ef6eb8f |  1 |  10.1.3.5 |       0
 630910c8-d0ef-421f-894e-6f58a954f215 |  1 |  10.1.4.5 | 0.99805
 767693df-fb0d-41a0-bb49-a614d7fbf20d |  0 | 10.1.18.5 |       1
 795a90e2-92e0-4028-afb0-0c3316c48192 |  0 | 10.1.21.5 |       1
 801019d9-008a-45d4-a7ce-b72f6e99a74d |  0 | 10.1.20.5 |       1
 806edbba-a66b-4710-9c65-47dd70503fc9 |  2 |  10.3.5.5 |       1
 8f5247e5-d449-4356-9ca7-1d971c79c7df |  2 |  10.3.3.5 |       1
 94d4ebc1-d5fc-4790-affe-ab4738ca0384 |  2 |  10.3.4.5 |       1
 9e43d924-684d-479b-b601-994e17b7fd86 |  0 | 10.1.11.5 |       1
 a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e |  1 |  10.1.2.5 |       0
 b9cd6c52-059d-44e1-ace0-be0a26568713 |  0 | 10.1.15.5 |       1
 bc74ea05-4878-4c5c-90e2-facb70cfe338 |  1 |  10.1.7.5 | 0.75098
 c2ba4efc-8b4d-4447-8b0b-6a512e1cac97 |  2 |  10.3.1.5 |       1
 d0bfc232-beeb-4062-9ad5-439c794594f3 |  2 |  10.3.7.5 |       1
 d47df269-f3a3-47ed-854b-17d6d31fa4fd |  1 |  10.1.6.5 |       1
 dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1 |  0 | 10.1.10.5 |       1
 e06fb88a-1683-41d6-97d8-92e1f3fb5196 |  1 |  10.1.5.5 |       0
 e676bb5a-c46c-4b72-8d87-0ef62e4a5c88 |  0 | 10.1.13.5 |       1
 e682408b-c165-4635-abef-d0c5809fee26 |  0 | 10.1.14.5 |       1
 ec2818ce-213a-4318-8f8b-6adaff99b696 |  3 |  10.4.1.5 |       1
 eec826ad-f395-4a1d-bfb1-20f5a19d4bb0 |  0 | 10.1.12.5 |       1
 f71dab5b-f40c-48db-a3d2-eefe6ec55f01 |  2 |  10.3.2.5 |       1"""
for x in servers.splitlines():
    v = [t.strip() for t in x.split('|')]
    if v[1] == '0':
        print v[0],
︡fa4df690-cabf-4bb6-a116-008034ac2acd︡{"stdout":"0985aa3e-c5e9-400e-8faa-32e7d5399dab 2d7f86ce-14a3-41cc-955c-af5211f4a85e 3056288c-a78d-4f64-af21-633214e845ad 767693df-fb0d-41a0-bb49-a614d7fbf20d 795a90e2-92e0-4028-afb0-0c3316c48192 801019d9-008a-45d4-a7ce-b72f6e99a74d 9e43d924-684d-479b-b601-994e17b7fd86 b9cd6c52-059d-44e1-ace0-be0a26568713 dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1 e676bb5a-c46c-4b72-8d87-0ef62e4a5c88 e682408b-c165-4635-abef-d0c5809fee26 eec826ad-f395-4a1d-bfb1-20f5a19d4bb0"}︡
︠930a6257-ec21-4deb-b272-3fea096e8e2c︠
for x in servers.splitlines():
    v = [t.strip() for t in x.split('|')]
    if v[1] == '1':
        print v[0],
︡56e371b0-48da-4a02-aea2-d4ef02279a02︡{"stdout":"306ad75d-ffe0-43a4-911d-60b8cd133bc8 4e4a8d4e-4efa-4435-8380-54795ef6eb8f 630910c8-d0ef-421f-894e-6f58a954f215 a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e bc74ea05-4878-4c5c-90e2-facb70cfe338 d47df269-f3a3-47ed-854b-17d6d31fa4fd e06fb88a-1683-41d6-97d8-92e1f3fb5196"}︡
︠4ed77951-7f9f-4f6a-a477-dc69f18f1cd0︠
v = '0985aa3e-c5e9-400e-8faa-32e7d5399dab 2d7f86ce-14a3-41cc-955c-af5211f4a85e 3056288c-a78d-4f64-af21-633214e845ad 767693df-fb0d-41a0-bb49-a614d7fbf20d 795a90e2-92e0-4028-afb0-0c3316c48192 801019d9-008a-45d4-a7ce-b72f6e99a74d 9e43d924-684d-479b-b601-994e17b7fd86 b9cd6c52-059d-44e1-ace0-be0a26568713 dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1 e676bb5a-c46c-4b72-8d87-0ef62e4a5c88 e682408b-c165-4635-abef-d0c5809fee26 eec826ad-f395-4a1d-bfb1-20f5a19d4bb0'
(x.c.move_projects_off_server(cb:((e)->console.log("DONE! #{s}",e)), server_id:s)  for s in v.split(' '))
︠df662f74-1225-44a2-aed6-ee3845f772fa︠
for s in '0985aa3e-c5e9-400e-8faa-32e7d5399dab 2d7f86ce-14a3-41cc-955c-af5211f4a85e 3056288c-a78d-4f64-af21-633214e845ad 767693df-fb0d-41a0-bb49-a614d7fbf20d 795a90e2-92e0-4028-afb0-0c3316c48192 801019d9-008a-45d4-a7ce-b72f6e99a74d 9e43d924-684d-479b-b601-994e17b7fd86 b9cd6c52-059d-44e1-ace0-be0a26568713 dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1 e676bb5a-c46c-4b72-8d87-0ef62e4a5c88 e682408b-c165-4635-abef-d0c5809fee26 eec826ad-f395-4a1d-bfb1-20f5a19d4bb0'.split():
    print "update storage_servers set health=0 where server_id=%s and dummy=true;"%s,
︡9235f52e-d507-461f-bdbf-5f58e3cd8fd5︡{"stdout":"update storage_servers set health=0 where server_id=0985aa3e-c5e9-400e-8faa-32e7d5399dab and dummy=true; update storage_servers set health=0 where server_id=2d7f86ce-14a3-41cc-955c-af5211f4a85e and dummy=true; update storage_servers set health=0 where server_id=3056288c-a78d-4f64-af21-633214e845ad and dummy=true; update storage_servers set health=0 where server_id=767693df-fb0d-41a0-bb49-a614d7fbf20d and dummy=true; update storage_servers set health=0 where server_id=795a90e2-92e0-4028-afb0-0c3316c48192 and dummy=true; update storage_servers set health=0 where server_id=801019d9-008a-45d4-a7ce-b72f6e99a74d and dummy=true; update storage_servers set health=0 where server_id=9e43d924-684d-479b-b601-994e17b7fd86 and dummy=true; update storage_servers set health=0 where server_id=b9cd6c52-059d-44e1-ace0-be0a26568713 and dummy=true; update storage_servers set health=0 where server_id=dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1 and dummy=true; update storage_servers set health=0 where server_id=e676bb5a-c46c-4b72-8d87-0ef62e4a5c88 and dummy=true; update storage_servers set health=0 where server_id=e682408b-c165-4635-abef-d0c5809fee26 and dummy=true; update storage_servers set health=0 where server_id=eec826ad-f395-4a1d-bfb1-20f5a19d4bb0 and dummy=true;"}︡
︠8431ab3c-5154-4070-af66-206348bc8533︠
x={};require('bup_server').global_client(cb:(e,c)->x.c=c)
︠edddc36c-a5a2-4364-9562-7d8fcc8f5fd0︠
for s in """bup@2014-08-08_00.50.01--5d             18K      -    32K  -
bup/bups@2014-08-08_00.50.01--5d          0      -    30K  -
bup/conf@2014-08-08_00.50.01--5d        19K      -    30K  -
bup/projects@2014-08-08_00.50.01--5d    18K      -    30K  -
bup/scratch@2014-08-08_00.50.01--5d       0      -    30K  -""".splitlines():
    print "zfs destroy " + s.split()[0]
︡cf413316-bafe-4fa6-8b7e-13de048b1b22︡{"stdout":"zfs destroy bup@2014-08-08_00.50.01--5d\nzfs destroy bup/bups@2014-08-08_00.50.01--5d\nzfs destroy bup/conf@2014-08-08_00.50.01--5d\nzfs destroy bup/projects@2014-08-08_00.50.01--5d\nzfs destroy bup/scratch@2014-08-08_00.50.01--5d\n"}︡
︠b079c2ec-a1e3-4d3b-be87-4c17b42ec033︠
for i in [1..7]:
    print "10.1."
︠cab0960b-b1d7-445d-9903-e7a0daa2125e︠
[(cloud.restart('vm',hostname='cassandra%s'%n,wait=False), cloud.restart('vm',hostname='web%s'%n,wait=False), cloud.restart('vm',hostname='compute%sdc1'%n,wait=False)) for n in range(1,8)]
︠35e5f3f5-d955-443f-9992-36761065a14f︠
[(cloud.wait_until_up('web%s cassandra%s'%(n,n)), cloud.start('hub',host='web%s'%n,wait=False, parallel=True), cloud.start('nginx',host='web%s'%n,wait=False), cloud.start('cassandra',host='cassandra%s'%n,wait=False)) for n in range(1,8)]
︠79054777-e3da-42e7-8905-80cf962e1466︠
[(cloud.restart('vm',hostname='cassandra%sb'%n,wait=False),cloud.restart('vm',hostname='compute%sdc1b'%n,wait=False)) for n in [5,6]]
︠1c2e0be0-ac7e-41b9-92ee-1e12fca64bc8︠

︠3b589dcd-75c3-4bd4-a50b-d49aea18919c︠
print "tmuxlogin -u root ",

for i in [1..7]:
    print "10.1.%s.2 10.1.%s.3 10.1.%s.5"%(i,i,i),
    if i in [5,6]:
        print "10.1.%s.10 10.1.%s.11 "%(i,i),

︡ce593d71-434d-48e1-8400-81c6b9e0ee3d︡{"stdout":"tmuxlogin -u root "}︡{"stdout":" 10.1.1.2 10.1.1.3 10.1.1.5 10.1.2.2 10.1.2.3 10.1.2.5 10.1.3.2 10.1.3.3 10.1.3.5 10.1.4.2 10.1.4.3 10.1.4.5 10.1.5.2 10.1.5.3 10.1.5.5 10.1.5.10 10.1.5.11  10.1.6.2 10.1.6.3 10.1.6.5 10.1.6.10 10.1.6.11  10.1.7.2 10.1.7.3 10.1.7.5"}︡
︠92548f5d-f1bc-4a93-a3f0-1e2ebd1ca68b︠

︠9dcd0be9-bf67-4cfa-abf7-ad8ec81b6ecb︠

︠d53f972a-7fc9-4216-b1e4-4bbed949c5e9︠

︠f64cd902-a2d4-4793-8eef-5f21112cae55︠
for s in 'a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e 306ad75d-ffe0-43a4-911d-60b8cd133bc8  4e4a8d4e-4efa-4435-8380-54795ef6eb8f 630910c8-d0ef-421f-894e-6f58a954f215 e06fb88a-1683-41d6-97d8-92e1f3fb5196 d47df269-f3a3-47ed-854b-17d6d31fa4fd bc74ea05-4878-4c5c-90e2-facb70cfe338'.split():
    print "update storage_servers set health=1 where server_id=%s and dummy=true;"%s,
︡807fa976-bf17-428c-817f-7319695abd0b︡{"stdout":"update storage_servers set health=1 where server_id=a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e and dummy=true; update storage_servers set health=1 where server_id=306ad75d-ffe0-43a4-911d-60b8cd133bc8 and dummy=true; update storage_servers set health=1 where server_id=4e4a8d4e-4efa-4435-8380-54795ef6eb8f and dummy=true; update storage_servers set health=1 where server_id=630910c8-d0ef-421f-894e-6f58a954f215 and dummy=true; update storage_servers set health=1 where server_id=e06fb88a-1683-41d6-97d8-92e1f3fb5196 and dummy=true; update storage_servers set health=1 where server_id=d47df269-f3a3-47ed-854b-17d6d31fa4fd and dummy=true; update storage_servers set health=1 where server_id=bc74ea05-4878-4c5c-90e2-facb70cfe338 and dummy=true;"}︡
︠c3deb9dc-fca9-4fbe-ae0d-76bf671201fa︠
update storage_servers set health=1 where server_id=306ad75d-ffe0-43a4-911d-60b8cd133bc8 and dummy=true;  update storage_servers set health=1 where server_id=4e4a8d4e-4efa-4435-8380-54795ef6eb8f and dummy=true; update storage_servers set health=1 where server_id=630910c8-d0ef-421f-894e-6f58a954f215 and dummy=true; update storage_servers set health=1 where server_id=e06fb88a-1683-41d6-97d8-92e1f3fb5196 and dummy=true; update storage_servers set health=1 where server_id=d47df269-f3a3-47ed-854b-17d6d31fa4fd and dummy=true; update storage_servers set health=1 where server_id=bc74ea05-4878-4c5c-90e2-facb70cfe338 and dummy=true;
︠fec99fd2-7a98-4fbb-b227-fd656059b155︠
qemu-system-x86_64 -enable-kvm -name compute3dc1 -S -machine pc-i440fx-trusty,accel=kvm,usb=off -cpu Opteron_G4,+perfctr_nb,+perfctr_core,+topoext,+nodeid_msr,+lwp,+wdt,+skinit,+ibs,+osvw,+cr8legacy,+extapic,+cmp_legacy,+fxsr_opt,+mmxext,+osxsave,+monitor,+ht,+vme -m 32768 -realtime mlock=off -smp 10,sockets=10,cores=1,threads=1 -uuid 9e6a23ae-6e80-2eda-e6db-83d2af96ee03 -no-user-config -nodefaults -chardev socket,id=charmonitor,path=/var/lib/libvirt/qemu/compute3dc1.monitor,server,nowait -mon chardev=charmonitor,id=monitor,mode=control -rtc base=utc -no-shutdown -boot strict=on -device piix3-usb-uhci,id=usb,               bus=pci.0,addr=0x1.0x2 -drive file=/home/salvus/vm/images/temporary/compute3dc1.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=writeback -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 -drive file=/dev/zvol/ssd/compute3dc1,if=none,id=drive-virtio-disk1,format=raw,cache=writeback -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x5,drive=drive-virtio-disk1,id=virtio-disk1 -netdev tap,fd=26,id=hostnet0,vhost=on,vhostfd=25 -device virtio-net-pci,netdev=hostnet0,id=net0,mac=52:54:00:c7:21:d4,bus=pci.0,addr=0x3 -chardev pty,id=charserial0 -device isa-serial,chardev=charserial0,id=serial0 -vnc 127.0.0.1:7200 -device cirrus-vga,id=video0,bus=pci.0,addr=0x2 -device virtio-balloon-pci,id=balloon0,bus=pci.0,addr=0x6
︠e1d2b6fb-a838-4aa0-97bd-7ca93ea57567︠
qemu-system-x86_64 -enable-kvm -name cassandra3x -S -machine pc-i440fx-trusty,accel=kvm,usb=off -cpu Opteron_G4,+perfctr_nb,+perfctr_core,+topoext,+nodeid_msr,+lwp,+wdt,+skinit,+ibs,+osvw,+cr8legacy,+extapic,+cmp_legacy,+fxsr_opt,+mmxext,+osxsave,+monitor,+ht,+vme -m 81920 -realtime mlock=off -smp  2,sockets= 2,cores=1,threads=1 -uuid a03ee51d-e81c-fa08-4955-08da9dfbc501 -no-user-config -nodefaults -chardev socket,id=charmonitor,path=/home/salvus/.config/libvirt/qemu/lib/cassandra3.monitor,server,nowait -mon chardev=charmonitor,id=monitor,mode=control -rtc base=utc -no-shutdown -boot strict=on -device piix3-usb-uhci,id=usb,bus=pci.0,addr=0x1.0x2 -drive file=/home/salvus/vm/images/temporary/cassandra3.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=writeback -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 -drive file=/dev/zvol/ssd/cassandra3,if=none,id=drive-virtio-disk1,format=raw,cache=writeback -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x5,drive=drive-virtio-disk1,id=virtio-disk1 -netdev user,id=hostnet0 -device rtl8139,netdev=hostnet0,id=net0,mac=52:54:00:9e:ff:76,bus=pci.0,addr=0x3 -chardev pty,id=charserial0 -device isa-serial,chardev=charserial0,id=serial0 -vnc 127.0.0.1:7300 -device cirrus-vga,id=video0,bus=pci.0,addr=0x2 -device virtio-balloon-pci,id=balloon0,bus=pci.0,addr=0x6
︠25afc35c-b3a2-484a-8a10-44eae1a48e12︠
qemu-system-x86_64 -enable-kvm -name cassandra3 -S -machine pc-i440fx-trusty,accel=kvm,usb=off -cpu Opteron_G4,+perfctr_nb,+perfctr_core,+topoext,+nodeid_msr,+lwp,+wdt,
+skinit,+ibs,+osvw,+cr8legacy,+extapic,+cmp_legacy,+fxsr_opt,+mmxext,+osxsave,+monitor,+ht,+vme -m 8192 -realtime mlock=off -smp 16,sockets=16,cores=1,threads=1 -uuid e834aebe-8a30-41d4-b483-3433
00887d58 -no-user-config -nodefaults -chardev socket,id=charmonitor,path=/var/lib/libvirt/qemu/cassandra3.monitor,server,nowait -mon chardev=charmonitor,id=monitor,mode=control -rtc base=utc -no-
shutdown -boot strict=on -device piix3-usb-uhci,id=usb,bus=pci.0,addr=0x1.0x2 -drive file=/home/salvus/vm/images/temporary/cassandra3.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=writebac
k -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 -drive file=/dev/zvol/ssd/cassandra3,if=none,id=drive-virtio-disk1,format=raw,cache=write
back -device virtio-blk-pci,scsi=off,bus=pci.0,addr=0x5,drive=drive-virtio-disk1,id=virtio-disk1 -netdev tap,fd=25,id=hostnet0,vhost=on,vhostfd=27 -device virtio-net-pci,netdev=hostnet0,id=net0,m
ac=52:54:00:fa:8e:a2,bus=pci.0,addr=0x3 -chardev pty,id=charserial0 -device isa-serial,chardev=charserial0,id=serial0 -vnc 127.0.0.1:7300 -device cirrus-vga,id=video0,bus=pci.0,addr=0x2 -device v
irtio-balloon-pci,id=balloon0,bus=pci.0,addr=0x6
︠0f4732c9-1e78-4465-a60d-9c8bf164d95d︠
/usr/bin/kvm -S -M pc-1.0 -cpu core2duo,+wdt,+skinit,+osvw,+3dnowprefetch,+misalignsse,+sse4a,+abm,+cr8legacy,+extapic,+svm,+cmp_legacy,+lahf_lm,+rdtscp,+pdpe1gb,+fxsr
_opt,+mmxext,+aes,+popcnt,+sse4.2,+sse4.1,+cx16,+ht -enable-kvm -m 8192 -smp 2,sockets=2,cores=1,threads=1 -name cassandra5 -uuid df100232-4808-a7c9-d2d7-219ca73ad719 -nodefconfig -nodefaults -ch
ardev socket,id=charmonitor,path=/var/lib/libvirt/qemu/cassandra5.monitor,server,nowait -mon chardev=charmonitor,id=monitor,mode=control -rtc base=utc -no-shutdown -drive file=/home/salvus/vm/ima
ges/temporary/cassandra5.img,if=none,id=drive-virtio-disk0,format=qcow2,cache=writeback -device virtio-blk-pci,bus=pci.0,addr=0x4,drive=drive-virtio-disk0,id=virtio-disk0,bootindex=1 -drive file=
/home/salvus/vm/images/persistent/cassandra5-cassandra-zfs.img,if=none,id=drive-virtio-disk1,format=qcow2,cache=writeback -device virtio-blk-pci,bus=pci.0,addr=0x5,drive=drive-virtio-disk1,id=vir
tio-disk1 -drive file=/home/salvus/vm/images/persistent/cassandra5-cassandra-zfs-2.img,if=none,id=drive-virtio-disk2,format=qcow2,cache=writeback -device virtio-blk-pci,bus=pci.0,addr=0x6,drive=d
rive-virtio-disk2,id=virtio-disk2 -netdev tap,fd=20,id=hostnet0 -device virtio-net-pci,netdev=hostnet0,id=net0,mac=52:54:00:fb:b9:4b,bus=pci.0,addr=0x3 -chardev pty,id=charserial0 -device isa-ser
ial,chardev=charserial0,id=serial0 -usb -vnc 127.0.0.1:7300 -vga cirrus -device virtio-balloon-pci,id=balloon0,bus=pci.0,addr=0x7
︠f4535bd0-2abd-4d53-a69d-c508ae323f6e︠
M = ModularSymbols(389,sign=1)
S = M.cuspidal_subspace()
D = S.decomposition()
len(D)
︡909f5235-caf0-4eba-8c9f-c9bdd432827b︡{"stdout":"5\n"}︡
︠fd38c8e9-14f8-4bc9-ba55-7ed7ff50224f︠
save(D,'389')
︡e1944cfc-c0c7-4cc0-9cc4-19f5890a585a︡
︠81978675-71de-4545-9e11-03166cd12789︠
!ls 389.sobj
︡9ef5dce4-3851-4533-8b27-b505ec0d262b︡{"stdout":"389.sobj\n"}︡
︠2fdee389-2f1e-455b-890b-1edc0f9fde0a︠
load('389.sobj')
︡ecdf4c9f-4004-4fe2-aef3-2f7ca404e355︡{"stdout":"[\nModular Symbols subspace of dimension 1 of Modular Symbols space of dimension 33 for Gamma_0(389) of weight 2 with sign 1 over Rational Field,\nModular Symbols subspace of dimension 2 of Modular Symbols space of dimension 33 for Gamma_0(389) of weight 2 with sign 1 over Rational Field,\nModular Symbols subspace of dimension 3 of Modular Symbols space of dimension 33 for Gamma_0(389) of weight 2 with sign 1 over Rational Field,\nModular Symbols subspace of dimension 6 of Modular Symbols space of dimension 33 for Gamma_0(389) of weight 2 with sign 1 over Rational Field,\nModular Symbols subspace of dimension 20 of Modular Symbols space of dimension 33 for Gamma_0(389) of weight 2 with sign 1 over Rational Field\n]\n"}︡
︠9f0eccf6-360e-48ff-a5be-254da9f63138︠
fork?
︡ad4f1804-75e7-40da-9098-d887e3297efe︡{"stdout":"   File: /projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_salvus.py\n   Docstring:\n      The %fork block decorator evaluates its code in a forked subprocess\n   that does not block the main process.\n\n   WARNING: This is highly experimental and possibly flakie. Use with\n   caution.\n\n   All (picklelable) global variables that are set in the forked\n   subprocess are set in the parent when the forked subprocess\n   terminates.  However, the forked subprocess has no other side\n   effects, except what it might do to file handles and the\n   filesystem.\n\n   To see currently running forked subprocesses, type fork.children(),\n   which returns a dictionary {pid:execute_uuid}. To kill a given\n   subprocess and stop the cell waiting for input, type\n   fork.kill(pid).  This is currently the only way to stop code\n   running in %fork cells.\n\n   TODO/WARNING: The subprocesses spawned by fork are not killed if\n   the parent process is killed first!\n\n   NOTE: All pexpect interfaces are reset in the child process.\n"}︡{"stdout":"\n"}︡
︠e7bd0ca7-516f-43fa-a711-fe4ddd638e8b︠
@fork
def f(n):
    return n*n
︡54d0b180-c1e6-412c-a905-caad496890ba︡{"stdout":"Forked subprocess 16976\n"}︡
︠c0a64a7c-1e50-46b4-833e-4d89c35af5d1︠
f(10)
︡dedcea1c-7848-4a96-990e-acbefa4e8f3d︡{"stderr":"Error in lines 1-1\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 736, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\nTypeError: 'NoneType' object is not callable\n"}︡
︠bb07a8e5-b164-4d42-9ccb-43267d76ba0e︠
%var x
solve((354-x)/424 == 0.8,x)
︡cf800a6e-2abc-4dbf-b852-bf7979842b4d︡{"stdout":"[x == (74/5)]\n"}︡
︠b2a9516b-849d-4fd6-aaaf-aa8ac032968a︠
424 - 354
︡b4c81609-39db-470c-b918-b11cab32bdc9︡{"stdout":"70\n"}︡
︠3aa53fe5-a386-4597-a570-50b226d1917f︠
74/5.
︡9477de1e-244d-4ff6-9bcd-52bb82bf5c3b︡{"stdout":"14.8000000000000\n"}︡
︠34236d9a-2862-410b-b3fe-6ceb701186b4︠

︠08347fa4-a092-4d7a-9e51-cd0acaeafb77︠
s="""        UUID: 4C4C4544-004C-4710-8030-B1C04F395631
root@cloud4:/home/salvus#
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud5:/home/salvus#
        UUID: 4C4C4544-0043-4210-8033-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud6:/home/salvus#
        UUID: 4C4C4544-0033-5A10-8056-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
        UUID: 4C4C4544-0043-4210-8030-B5C04F395931
root@cloud7:/home/salvus#
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud10:/home/salvus#
        UUID: 4C4C4544-0043-4310-8030-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud11:/home/salvus#
        UUID: 4C4C4544-0043-4210-8031-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud12:/home/salvus#
        UUID: 4C4C4544-0043-3810-8031-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud13:/home/salvus#
        UUID: 4C4C4544-0043-4310-8031-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud14:/home/salvus#
        UUID: 4C4C4544-0043-3910-8032-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud15:/home/salvus#
        UUID: 4C4C4544-0043-3810-8033-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud16:/home/salvus#
        UUID: 4C4C4544-0043-3810-8032-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud17:/home/salvus#
        UUID: 4C4C4544-0059-5210-8030-B1C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud18:/home/salvus#
        UUID: 4C4C4544-0059-5210-8031-B1C04F395931
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────���──────────────────────────────────────────────────────────────────────────────────
root@cloud19:/home/salvus#
        UUID: 4C4C4544-0043-3910-8030-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
root@cloud20:/home/salvus#
        UUID: 4C4C4544-0043-4210-8032-B5C04F395931
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
*** System restart required ***
Last login: Wed Aug  6 14:22:57 2014 from 10.1.3.1
salvus@cloud21:~$ sudo su
[sudo] password for salvus:
root@cloud21:/home/salvus# dmidecode -t system |grep UUID
        UUID: 4C4C4544-0043-3910-8031-B5C04F395931
"""
︡43d2c76a-719f-47ef-85ac-dd1f635365c0︡
︠9dfe0597-63c5-45db-995f-051705901b3c︠
for x in s.splitlines():
    v = x.split("UUID:")
    if len(v) > 1:
        print v[1],

︡7e778997-df89-43e6-94fc-f924b6d943d5︡{"stdout":" 4C4C4544-004C-4710-8030-B1C04F395631  4C4C4544-0043-4210-8033-B5C04F395931  4C4C4544-0033-5A10-8056-B5C04F395931  4C4C4544-0043-4210-8030-B5C04F395931  4C4C4544-0043-4310-8030-B5C04F395931  4C4C4544-0043-4210-8031-B5C04F395931  4C4C4544-0043-3810-8031-B5C04F395931  4C4C4544-0043-4310-8031-B5C04F395931  4C4C4544-0043-3910-8032-B5C04F395931  4C4C4544-0043-3810-8033-B5C04F395931  4C4C4544-0043-3810-8032-B5C04F395931  4C4C4544-0059-5210-8030-B1C04F395931  4C4C4544-0059-5210-8031-B1C04F395931  4C4C4544-0043-3910-8030-B5C04F395931  4C4C4544-0043-4210-8032-B5C04F395931  4C4C4544-0043-3910-8031-B5C04F395931"}︡
︠2f10ca1a-49a0-493f-872b-db708e8e6402︠
4488.91/30
︡d238983b-9145-4aae-a287-f204e1be7aef︡{"stdout":"149.630333333333\n"}︡
︠adb10eee-d911-4fc3-a1a0-628835cbac81︠

︠d95b585d-77a4-4b50-bb66-dcc7e3cf04a6︠
12150*9
︡85d3ab33-4dcd-43fc-96ad-03b6d2a96867︡{"stdout":"109350\n"}︡
︠8b746dbb-ccdf-4ee0-bfb8-66db200beda8︠
solve(x*(1.045) == 12150*9, x)
︡7f443560-bbdb-46d9-bd1f-ba12d07e0754︡{"stdout":"[x == (21870000/209)]"}︡{"stdout":"\n"}︡
︠e1a9d90e-aafb-4885-a557-f58e5c2cf89e︠
21870000/209.
︡0a29bc01-09f2-45d4-a99d-7cfc0f9153df︡{"stdout":"104641.148325359\n"}︡
︠9e1166f8-16de-478b-a634-8de281d5147c︠

︠6cbdd2d3-1039-4a6c-bea1-0aa837d36103︠
for x in """37_20k: b23cd1fb-845c-4cfd-8ee4-29e7667fe342
20k_40k: ea66b23d-f0e0-4eeb-ae91-6ea8edd4544b
40k_60k: b0ff04b9-1f75-4655-acfc-19332e59557c
60k_80k: 09e3b3dc-f370-4023-a9f3-6fb4d45e8049
80k_100k: d07f124d-e82a-4fbc-80f6-1b0152c6ed7f
100k_120k: 430c64c3-4ab8-40e9-9c4d-40c41248bdc7
120k_140k: cc38ca35-5bb2-4ad2-a139-f2ea6e6364d0
140k_160k: b3f51331-6106-4051-8d1e-dc03de08f47f
160k_180k: 0ba22958-6302-4344-a2ec-f330dc4d20b9
180k_200k: 03e658b8-bc75-40f6-8bfb-55043ba09e70""".splitlines():
    i = x.split()[1]
    print "x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('%s').set_settings(mintime:999999999999999999,cb:console.log))"%i

︡e712f74b-99dc-46d7-9a6d-56d22c6b41f9︡{"stdout":"x={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('b23cd1fb-845c-4cfd-8ee4-29e7667fe342').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('ea66b23d-f0e0-4eeb-ae91-6ea8edd4544b').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('b0ff04b9-1f75-4655-acfc-19332e59557c').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('09e3b3dc-f370-4023-a9f3-6fb4d45e8049').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('d07f124d-e82a-4fbc-80f6-1b0152c6ed7f').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('430c64c3-4ab8-40e9-9c4d-40c41248bdc7').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('cc38ca35-5bb2-4ad2-a139-f2ea6e6364d0').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('b3f51331-6106-4051-8d1e-dc03de08f47f').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('0ba22958-6302-4344-a2ec-f330dc4d20b9').set_settings(mintime:999999999999999999,cb:console.log))\nx={};require('bup_server').global_client(cb:(e,c)->x.c=c; x.c.get_project('03e658b8-bc75-40f6-8bfb-55043ba09e70').set_settings(mintime:999999999999999999,cb:console.log))\n"}︡
︠6fced267-b3b2-4e09-9795-165e3eea7999︠
@parallel
def f(m):
    return [factor(k) for k in range(1000*m, 1000*(m+1)) if k]

t = []
for x in f([1..20]):
    print x[0]
    t.append(x)


︡5d2a8de7-d1bd-4bf1-adb8-ddc0a6aee2fc︡{"stdout":"((1,), {})"}︡{"stdout":"\n"}︡{"stdout":"((2,), {})\n"}︡{"stdout":"((3,), {})\n"}︡{"stdout":"((4,), {})\n"}︡{"stdout":"((5,), {})"}︡{"stdout":"\n"}︡{"stdout":"((6,), {})\n"}︡{"stdout":"((7,), {})\n"}︡{"stdout":"((8,), {})\n"}︡{"stdout":"((9,), {})"}︡{"stdout":"\n"}︡{"stdout":"((10,), {})\n"}︡{"stdout":"((11,), {})\n((12,), {})\n((13,), {})\n((14,), {})\n((15,), {})\n((16,), {})"}︡{"stdout":"\n((17,), {})\n((18,), {})\n((19,), {})\n((20,), {})"}︡{"stdout":"\n"}︡
︠643802e4-8fbe-4e97-b440-8099ca13108b︠
t[0]
︡b71a5ac0-4f0d-443f-ab85-d25e7e034bc6︡{"stdout":"(((1,), {}), [2^3 * 5^3, 7 * 11 * 13, 2 * 3 * 167, 17 * 59, 2^2 * 251, 3 * 5 * 67, 2 * 503, 19 * 53, 2^4 * 3^2 * 7, 1009, 2 * 5 * 101, 3 * 337, 2^2 * 11 * 23, 1013, 2 * 3 * 13^2, 5 * 7 * 29, 2^3 * 127, 3^2 * 113, 2 * 509, 1019, 2^2 * 3 * 5 * 17, 1021, 2 * 7 * 73, 3 * 11 * 31, 2^10, 5^2 * 41, 2 * 3^3 * 19, 13 * 79, 2^2 * 257, 3 * 7^3, 2 * 5 * 103, 1031, 2^3 * 3 * 43, 1033, 2 * 11 * 47, 3^2 * 5 * 23, 2^2 * 7 * 37, 17 * 61, 2 * 3 * 173, 1039, 2^4 * 5 * 13, 3 * 347, 2 * 521, 7 * 149, 2^2 * 3^2 * 29, 5 * 11 * 19, 2 * 523, 3 * 349, 2^3 * 131, 1049, 2 * 3 * 5^2 * 7, 1051, 2^2 * 263, 3^4 * 13, 2 * 17 * 31, 5 * 211, 2^5 * 3 * 11, 7 * 151, 2 * 23^2, 3 * 353, 2^2 * 5 * 53, 1061, 2 * 3^2 * 59, 1063, 2^3 * 7 * 19, 3 * 5 * 71, 2 * 13 * 41, 11 * 97, 2^2 * 3 * 89, 1069, 2 * 5 * 107, 3^2 * 7 * 17, 2^4 * 67, 29 * 37, 2 * 3 * 179, 5^2 * 43, 2^2 * 269, 3 * 359, 2 * 7^2 * 11, 13 * 83, 2^3 * 3^3 * 5, 23 * 47, 2 * 541, 3 * 19^2, 2^2 * 271, 5 * 7 * 31, 2 * 3 * 181, 1087, 2^6 * 17, 3^2 * 11^2, 2 * 5 * 109, 1091, 2^2 * 3 * 7 * 13, 1093, 2 * 547, 3 * 5 * 73, 2^3 * 137, 1097, 2 * 3^2 * 61, 7 * 157, 2^2 * 5^2 * 11, 3 * 367, 2 * 19 * 29, 1103, 2^4 * 3 * 23, 5 * 13 * 17, 2 * 7 * 79, 3^3 * 41, 2^2 * 277, 1109, 2 * 3 * 5 * 37, 11 * 101, 2^3 * 139, 3 * 7 * 53, 2 * 557, 5 * 223, 2^2 * 3^2 * 31, 1117, 2 * 13 * 43, 3 * 373, 2^5 * 5 * 7, 19 * 59, 2 * 3 * 11 * 17, 1123, 2^2 * 281, 3^2 * 5^3, 2 * 563, 7^2 * 23, 2^3 * 3 * 47, 1129, 2 * 5 * 113, 3 * 13 * 29, 2^2 * 283, 11 * 103, 2 * 3^4 * 7, 5 * 227, 2^4 * 71, 3 * 379, 2 * 569, 17 * 67, 2^2 * 3 * 5 * 19, 7 * 163, 2 * 571, 3^2 * 127, 2^3 * 11 * 13, 5 * 229, 2 * 3 * 191, 31 * 37, 2^2 * 7 * 41, 3 * 383, 2 * 5^2 * 23, 1151, 2^7 * 3^2, 1153, 2 * 577, 3 * 5 * 7 * 11, 2^2 * 17^2, 13 * 89, 2 * 3 * 193, 19 * 61, 2^3 * 5 * 29, 3^3 * 43, 2 * 7 * 83, 1163, 2^2 * 3 * 97, 5 * 233, 2 * 11 * 53, 3 * 389, 2^4 * 73, 7 * 167, 2 * 3^2 * 5 * 13, 1171, 2^2 * 293, 3 * 17 * 23, 2 * 587, 5^2 * 47, 2^3 * 3 * 7^2, 11 * 107, 2 * 19 * 31, 3^2 * 131, 2^2 * 5 * 59, 1181, 2 * 3 * 197, 7 * 13^2, 2^5 * 37, 3 * 5 * 79, 2 * 593, 1187, 2^2 * 3^3 * 11, 29 * 41, 2 * 5 * 7 * 17, 3 * 397, 2^3 * 149, 1193, 2 * 3 * 199, 5 * 239, 2^2 * 13 * 23, 3^2 * 7 * 19, 2 * 599, 11 * 109, 2^4 * 3 * 5^2, 1201, 2 * 601, 3 * 401, 2^2 * 7 * 43, 5 * 241, 2 * 3^2 * 67, 17 * 71, 2^3 * 151, 3 * 13 * 31, 2 * 5 * 11^2, 7 * 173, 2^2 * 3 * 101, 1213, 2 * 607, 3^5 * 5, 2^6 * 19, 1217, 2 * 3 * 7 * 29, 23 * 53, 2^2 * 5 * 61, 3 * 11 * 37, 2 * 13 * 47, 1223, 2^3 * 3^2 * 17, 5^2 * 7^2, 2 * 613, 3 * 409, 2^2 * 307, 1229, 2 * 3 * 5 * 41, 1231, 2^4 * 7 * 11, 3^2 * 137, 2 * 617, 5 * 13 * 19, 2^2 * 3 * 103, 1237, 2 * 619, 3 * 7 * 59, 2^3 * 5 * 31, 17 * 73, 2 * 3^3 * 23, 11 * 113, 2^2 * 311, 3 * 5 * 83, 2 * 7 * 89, 29 * 43, 2^5 * 3 * 13, 1249, 2 * 5^4, 3^2 * 139, 2^2 * 313, 7 * 179, 2 * 3 * 11 * 19, 5 * 251, 2^3 * 157, 3 * 419, 2 * 17 * 37, 1259, 2^2 * 3^2 * 5 * 7, 13 * 97, 2 * 631, 3 * 421, 2^4 * 79, 5 * 11 * 23, 2 * 3 * 211, 7 * 181, 2^2 * 317, 3^3 * 47, 2 * 5 * 127, 31 * 41, 2^3 * 3 * 53, 19 * 67, 2 * 7^2 * 13, 3 * 5^2 * 17, 2^2 * 11 * 29, 1277, 2 * 3^2 * 71, 1279, 2^8 * 5, 3 * 7 * 61, 2 * 641, 1283, 2^2 * 3 * 107, 5 * 257, 2 * 643, 3^2 * 11 * 13, 2^3 * 7 * 23, 1289, 2 * 3 * 5 * 43, 1291, 2^2 * 17 * 19, 3 * 431, 2 * 647, 5 * 7 * 37, 2^4 * 3^4, 1297, 2 * 11 * 59, 3 * 433, 2^2 * 5^2 * 13, 1301, 2 * 3 * 7 * 31, 1303, 2^3 * 163, 3^2 * 5 * 29, 2 * 653, 1307, 2^2 * 3 * 109, 7 * 11 * 17, 2 * 5 * 131, 3 * 19 * 23, 2^5 * 41, 13 * 101, 2 * 3^2 * 73, 5 * 263, 2^2 * 7 * 47, 3 * 439, 2 * 659, 1319, 2^3 * 3 * 5 * 11, 1321, 2 * 661, 3^3 * 7^2, 2^2 * 331, 5^2 * 53, 2 * 3 * 13 * 17, 1327, 2^4 * 83, 3 * 443, 2 * 5 * 7 * 19, 11^3, 2^2 * 3^2 * 37, 31 * 43, 2 * 23 * 29, 3 * 5 * 89, 2^3 * 167, 7 * 191, 2 * 3 * 223, 13 * 103, 2^2 * 5 * 67, 3^2 * 149, 2 * 11 * 61, 17 * 79, 2^6 * 3 * 7, 5 * 269, 2 * 673, 3 * 449, 2^2 * 337, 19 * 71, 2 * 3^3 * 5^2, 7 * 193, 2^3 * 13^2, 3 * 11 * 41, 2 * 677, 5 * 271, 2^2 * 3 * 113, 23 * 59, 2 * 7 * 97, 3^2 * 151, 2^4 * 5 * 17, 1361, 2 * 3 * 227, 29 * 47, 2^2 * 11 * 31, 3 * 5 * 7 * 13, 2 * 683, 1367, 2^3 * 3^2 * 19, 37^2, 2 * 5 * 137, 3 * 457, 2^2 * 7^3, 1373, 2 * 3 * 229, 5^3 * 11, 2^5 * 43, 3^4 * 17, 2 * 13 * 53, 7 * 197, 2^2 * 3 * 5 * 23, 1381, 2 * 691, 3 * 461, 2^3 * 173, 5 * 277, 2 * 3^2 * 7 * 11, 19 * 73, 2^2 * 347, 3 * 463, 2 * 5 * 139, 13 * 107, 2^4 * 3 * 29, 7 * 199, 2 * 17 * 41, 3^2 * 5 * 31, 2^2 * 349, 11 * 127, 2 * 3 * 233, 1399, 2^3 * 5^2 * 7, 3 * 467, 2 * 701, 23 * 61, 2^2 * 3^3 * 13, 5 * 281, 2 * 19 * 37, 3 * 7 * 67, 2^7 * 11, 1409, 2 * 3 * 5 * 47, 17 * 83, 2^2 * 353, 3^2 * 157, 2 * 7 * 101, 5 * 283, 2^3 * 3 * 59, 13 * 109, 2 * 709, 3 * 11 * 43, 2^2 * 5 * 71, 7^2 * 29, 2 * 3^2 * 79, 1423, 2^4 * 89, 3 * 5^2 * 19, 2 * 23 * 31, 1427, 2^2 * 3 * 7 * 17, 1429, 2 * 5 * 11 * 13, 3^3 * 53, 2^3 * 179, 1433, 2 * 3 * 239, 5 * 7 * 41, 2^2 * 359, 3 * 479, 2 * 719, 1439, 2^5 * 3^2 * 5, 11 * 131, 2 * 7 * 103, 3 * 13 * 37, 2^2 * 19^2, 5 * 17^2, 2 * 3 * 241, 1447, 2^3 * 181, 3^2 * 7 * 23, 2 * 5^2 * 29, 1451, 2^2 * 3 * 11^2, 1453, 2 * 727, 3 * 5 * 97, 2^4 * 7 * 13, 31 * 47, 2 * 3^6, 1459, 2^2 * 5 * 73, 3 * 487, 2 * 17 * 43, 7 * 11 * 19, 2^3 * 3 * 61, 5 * 293, 2 * 733, 3^2 * 163, 2^2 * 367, 13 * 113, 2 * 3 * 5 * 7^2, 1471, 2^6 * 23, 3 * 491, 2 * 11 * 67, 5^2 * 59, 2^2 * 3^2 * 41, 7 * 211, 2 * 739, 3 * 17 * 29, 2^3 * 5 * 37, 1481, 2 * 3 * 13 * 19, 1483, 2^2 * 7 * 53, 3^3 * 5 * 11, 2 * 743, 1487, 2^4 * 3 * 31, 1489, 2 * 5 * 149, 3 * 7 * 71, 2^2 * 373, 1493, 2 * 3^2 * 83, 5 * 13 * 23, 2^3 * 11 * 17, 3 * 499, 2 * 7 * 107, 1499, 2^2 * 3 * 5^3, 19 * 79, 2 * 751, 3^2 * 167, 2^5 * 47, 5 * 7 * 43, 2 * 3 * 251, 11 * 137, 2^2 * 13 * 29, 3 * 503, 2 * 5 * 151, 1511, 2^3 * 3^3 * 7, 17 * 89, 2 * 757, 3 * 5 * 101, 2^2 * 379, 37 * 41, 2 * 3 * 11 * 23, 7^2 * 31, 2^4 * 5 * 19, 3^2 * 13^2, 2 * 761, 1523, 2^2 * 3 * 127, 5^2 * 61, 2 * 7 * 109, 3 * 509, 2^3 * 191, 11 * 139, 2 * 3^2 * 5 * 17, 1531, 2^2 * 383, 3 * 7 * 73, 2 * 13 * 59, 5 * 307, 2^9 * 3, 29 * 53, 2 * 769, 3^4 * 19, 2^2 * 5 * 7 * 11, 23 * 67, 2 * 3 * 257, 1543, 2^3 * 193, 3 * 5 * 103, 2 * 773, 7 * 13 * 17, 2^2 * 3^2 * 43, 1549, 2 * 5^2 * 31, 3 * 11 * 47, 2^4 * 97, 1553, 2 * 3 * 7 * 37, 5 * 311, 2^2 * 389, 3^2 * 173, 2 * 19 * 41, 1559, 2^3 * 3 * 5 * 13, 7 * 223, 2 * 11 * 71, 3 * 521, 2^2 * 17 * 23, 5 * 313, 2 * 3^3 * 29, 1567, 2^5 * 7^2, 3 * 523, 2 * 5 * 157, 1571, 2^2 * 3 * 131, 11^2 * 13, 2 * 787, 3^2 * 5^2 * 7, 2^3 * 197, 19 * 83, 2 * 3 * 263, 1579, 2^2 * 5 * 79, 3 * 17 * 31, 2 * 7 * 113, 1583, 2^4 * 3^2 * 11, 5 * 317, 2 * 13 * 61, 3 * 23^2, 2^2 * 397, 7 * 227, 2 * 3 * 5 * 53, 37 * 43, 2^3 * 199, 3^3 * 59, 2 * 797, 5 * 11 * 29, 2^2 * 3 * 7 * 19, 1597, 2 * 17 * 47, 3 * 13 * 41, 2^6 * 5^2, 1601, 2 * 3^2 * 89, 7 * 229, 2^2 * 401, 3 * 5 * 107, 2 * 11 * 73, 1607, 2^3 * 3 * 67, 1609, 2 * 5 * 7 * 23, 3^2 * 179, 2^2 * 13 * 31, 1613, 2 * 3 * 269, 5 * 17 * 19, 2^4 * 101, 3 * 7^2 * 11, 2 * 809, 1619, 2^2 * 3^4 * 5, 1621, 2 * 811, 3 * 541, 2^3 * 7 * 29, 5^3 * 13, 2 * 3 * 271, 1627, 2^2 * 11 * 37, 3^2 * 181, 2 * 5 * 163, 7 * 233, 2^5 * 3 * 17, 23 * 71, 2 * 19 * 43, 3 * 5 * 109, 2^2 * 409, 1637, 2 * 3^2 * 7 * 13, 11 * 149, 2^3 * 5 * 41, 3 * 547, 2 * 821, 31 * 53, 2^2 * 3 * 137, 5 * 7 * 47, 2 * 823, 3^3 * 61, 2^4 * 103, 17 * 97, 2 * 3 * 5^2 * 11, 13 * 127, 2^2 * 7 * 59, 3 * 19 * 29, 2 * 827, 5 * 331, 2^3 * 3^2 * 23, 1657, 2 * 829, 3 * 7 * 79, 2^2 * 5 * 83, 11 * 151, 2 * 3 * 277, 1663, 2^7 * 13, 3^2 * 5 * 37, 2 * 7^2 * 17, 1667, 2^2 * 3 * 139, 1669, 2 * 5 * 167, 3 * 557, 2^3 * 11 * 19, 7 * 239, 2 * 3^3 * 31, 5^2 * 67, 2^2 * 419, 3 * 13 * 43, 2 * 839, 23 * 73, 2^4 * 3 * 5 * 7, 41^2, 2 * 29^2, 3^2 * 11 * 17, 2^2 * 421, 5 * 337, 2 * 3 * 281, 7 * 241, 2^3 * 211, 3 * 563, 2 * 5 * 13^2, 19 * 89, 2^2 * 3^2 * 47, 1693, 2 * 7 * 11^2, 3 * 5 * 113, 2^5 * 53, 1697, 2 * 3 * 283, 1699, 2^2 * 5^2 * 17, 3^5 * 7, 2 * 23 * 37, 13 * 131, 2^3 * 3 * 71, 5 * 11 * 31, 2 * 853, 3 * 569, 2^2 * 7 * 61, 1709, 2 * 3^2 * 5 * 19, 29 * 59, 2^4 * 107, 3 * 571, 2 * 857, 5 * 7^3, 2^2 * 3 * 11 * 13, 17 * 101, 2 * 859, 3^2 * 191, 2^3 * 5 * 43, 1721, 2 * 3 * 7 * 41, 1723, 2^2 * 431, 3 * 5^2 * 23, 2 * 863, 11 * 157, 2^6 * 3^3, 7 * 13 * 19, 2 * 5 * 173, 3 * 577, 2^2 * 433, 1733, 2 * 3 * 17^2, 5 * 347, 2^3 * 7 * 31, 3^2 * 193, 2 * 11 * 79, 37 * 47, 2^2 * 3 * 5 * 29, 1741, 2 * 13 * 67, 3 * 7 * 83, 2^4 * 109, 5 * 349, 2 * 3^2 * 97, 1747, 2^2 * 19 * 23, 3 * 11 * 53, 2 * 5^3 * 7, 17 * 103, 2^3 * 3 * 73, 1753, 2 * 877, 3^3 * 5 * 13, 2^2 * 439, 7 * 251, 2 * 3 * 293, 1759, 2^5 * 5 * 11, 3 * 587, 2 * 881, 41 * 43, 2^2 * 3^2 * 7^2, 5 * 353, 2 * 883, 3 * 19 * 31, 2^3 * 13 * 17, 29 * 61, 2 * 3 * 5 * 59, 7 * 11 * 23, 2^2 * 443, 3^2 * 197, 2 * 887, 5^2 * 71, 2^4 * 3 * 37, 1777, 2 * 7 * 127, 3 * 593, 2^2 * 5 * 89, 13 * 137, 2 * 3^4 * 11, 1783, 2^3 * 223, 3 * 5 * 7 * 17, 2 * 19 * 47, 1787, 2^2 * 3 * 149, 1789, 2 * 5 * 179, 3^2 * 199, 2^8 * 7, 11 * 163, 2 * 3 * 13 * 23, 5 * 359, 2^2 * 449, 3 * 599, 2 * 29 * 31, 7 * 257, 2^3 * 3^2 * 5^2, 1801, 2 * 17 * 53, 3 * 601, 2^2 * 11 * 41, 5 * 19^2, 2 * 3 * 7 * 43, 13 * 139, 2^4 * 113, 3^3 * 67, 2 * 5 * 181, 1811, 2^2 * 3 * 151, 7^2 * 37, 2 * 907, 3 * 5 * 11^2, 2^3 * 227, 23 * 79, 2 * 3^2 * 101, 17 * 107, 2^2 * 5 * 7 * 13, 3 * 607, 2 * 911, 1823, 2^5 * 3 * 19, 5^2 * 73, 2 * 11 * 83, 3^2 * 7 * 29, 2^2 * 457, 31 * 59, 2 * 3 * 5 * 61, 1831, 2^3 * 229, 3 * 13 * 47, 2 * 7 * 131, 5 * 367, 2^2 * 3^3 * 17, 11 * 167, 2 * 919, 3 * 613, 2^4 * 5 * 23, 7 * 263, 2 * 3 * 307, 19 * 97, 2^2 * 461, 3^2 * 5 * 41, 2 * 13 * 71, 1847, 2^3 * 3 * 7 * 11, 43^2, 2 * 5^2 * 37, 3 * 617, 2^2 * 463, 17 * 109, 2 * 3^2 * 103, 5 * 7 * 53, 2^6 * 29, 3 * 619, 2 * 929, 11 * 13^2, 2^2 * 3 * 5 * 31, 1861, 2 * 7^2 * 19, 3^4 * 23, 2^3 * 233, 5 * 373, 2 * 3 * 311, 1867, 2^2 * 467, 3 * 7 * 89, 2 * 5 * 11 * 17, 1871, 2^4 * 3^2 * 13, 1873, 2 * 937, 3 * 5^4, 2^2 * 7 * 67, 1877, 2 * 3 * 313, 1879, 2^3 * 5 * 47, 3^2 * 11 * 19, 2 * 941, 7 * 269, 2^2 * 3 * 157, 5 * 13 * 29, 2 * 23 * 41, 3 * 17 * 37, 2^5 * 59, 1889, 2 * 3^3 * 5 * 7, 31 * 61, 2^2 * 11 * 43, 3 * 631, 2 * 947, 5 * 379, 2^3 * 3 * 79, 7 * 271, 2 * 13 * 73, 3^2 * 211, 2^2 * 5^2 * 19, 1901, 2 * 3 * 317, 11 * 173, 2^4 * 7 * 17, 3 * 5 * 127, 2 * 953, 1907, 2^2 * 3^2 * 53, 23 * 83, 2 * 5 * 191, 3 * 7^2 * 13, 2^3 * 239, 1913, 2 * 3 * 11 * 29, 5 * 383, 2^2 * 479, 3^3 * 71, 2 * 7 * 137, 19 * 101, 2^7 * 3 * 5, 17 * 113, 2 * 31^2, 3 * 641, 2^2 * 13 * 37, 5^2 * 7 * 11, 2 * 3^2 * 107, 41 * 47, 2^3 * 241, 3 * 643, 2 * 5 * 193, 1931, 2^2 * 3 * 7 * 23, 1933, 2 * 967, 3^2 * 5 * 43, 2^4 * 11^2, 13 * 149, 2 * 3 * 17 * 19, 7 * 277, 2^2 * 5 * 97, 3 * 647, 2 * 971, 29 * 67, 2^3 * 3^5, 5 * 389, 2 * 7 * 139, 3 * 11 * 59, 2^2 * 487, 1949, 2 * 3 * 5^2 * 13, 1951, 2^5 * 61, 3^2 * 7 * 31, 2 * 977, 5 * 17 * 23, 2^2 * 3 * 163, 19 * 103, 2 * 11 * 89, 3 * 653, 2^3 * 5 * 7^2, 37 * 53, 2 * 3^2 * 109, 13 * 151, 2^2 * 491, 3 * 5 * 131, 2 * 983, 7 * 281, 2^4 * 3 * 41, 11 * 179, 2 * 5 * 197, 3^3 * 73, 2^2 * 17 * 29, 1973, 2 * 3 * 7 * 47, 5^2 * 79, 2^3 * 13 * 19, 3 * 659, 2 * 23 * 43, 1979, 2^2 * 3^2 * 5 * 11, 7 * 283, 2 * 991, 3 * 661, 2^6 * 31, 5 * 397, 2 * 3 * 331, 1987, 2^2 * 7 * 71, 3^2 * 13 * 17, 2 * 5 * 199, 11 * 181, 2^3 * 3 * 83, 1993, 2 * 997, 3 * 5 * 7 * 19, 2^2 * 499, 1997, 2 * 3^3 * 37, 1999])"}︡{"stdout":"\n"}︡
︠1697e577-977d-45a1-a34c-78d5a8e735a4︠
len(t)
︡84899063-12c0-4168-ae6c-454bba112a2e︡{"stdout":"20\n"}︡
︠9595f48f-9374-42f5-9157-4ee01b133d41︠
factor(0)
︡f8a030af-81ec-4832-97bf-321ac8986226︡{"stderr":"Error in lines 1-1\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 736, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"/usr/local/sage/sage-6.3.beta6/local/lib/python2.7/site-packages/sage/rings/arith.py\", line 2467, in factor\n    int_ = int_, verbose=verbose)\n  File \"integer.pyx\", line 3527, in sage.rings.integer.Integer.factor (build/cythonized/sage/rings/integer.c:22085)\nArithmeticError: Prime factorization of 0 not defined.\n"}︡
︠cd3991ba-ca9a-4322-83e3-87181979ca14︠

︠222d276a-74a8-45af-bc9b-b336a3dcbd65︠
version()
︡a6844aec-165e-4f93-b7db-d48672c57825︡{"stdout":"'Sage Version 6.3.beta6, Release Date: 2014-07-19'\n"}︡
︠92aa0a92-2579-46a1-ae5c-746fa1db6c3e︠
%html
hi
︡c1c4f132-8b52-4a8a-9eed-167997fb9615︡{"html":"hi\n"}︡
︠601e2c39-e634-42ab-9447-70074124325f︠
plot(sin)
︡aa3cc7d3-83bc-4906-82cb-ea02121a035e︡{"once":false,"file":{"show":true,"uuid":"c6c955bb-8b12-4f0d-b74d-8dd4308ef2b5","filename":"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sage/temp/compute12dc0/14447/tmp__qiB9_.svg"}}︡
︠69ed860f-ac3b-49e0-8db1-2060eeece876︠
@interact
def f(n=[1..5]):
    print n
︡550c2894-c8de-45c1-8441-a79b81e79066︡{"interact":{"style":"None","flicker":false,"layout":[[["n",12,null]],[["",12,null]]],"id":"87336fca-c64e-4c09-b77b-cef3b2e22938","controls":[{"buttons":true,"control_type":"selector","ncols":null,"button_classes":null,"default":0,"lbls":["1","2","3","4","5"],"label":"n","nrows":null,"width":null,"var":"n"}]}}︡
︠b913ccce-10aa-46e9-8b32-e836cc5dbc81︠
import pandasql
︡f26eb276-d887-4123-a86a-affcfe74892b︡
︠67dd5345-9b6c-4f3c-968e-295285485ac1︠
version()
︡cc54a849-6671-4718-96b6-bf8fef2b3fda︡{"stdout":"'Sage Version 6.3.beta6, Release Date: 2014-07-19'\n"}︡
︠ed944823-1d9b-4a24-ba8e-ce50211260e2︠

︠bd6b5b84-b9ba-487c-8fad-ce2d103d75c7︠
b.install_quantlib(); b.install_neuron(); b.install_basemap(); b.install_4ti2(); b.clean_up(); b.extend_sys_path(); b.fix_permissions()
︠5ffb0007-6194-47e4-8ed7-c91cc0d0e0fb︠
show(x^2)
︡7242362f-2ac6-4350-8d62-d99fc3818b50︡{"tex":{"tex":"x^{2}","display":true}}︡
︠76e32756-5112-4c4f-9b43-35ba59a49988︠
%md
# still broken:

    b.install_basemap()

    Cloning into 'basemap'...
    fatal: Unable to find remote helper for 'https'
︠1eae0150-acd9-4523-a6f4-909f16baff96︠

︠b1319c09-07da-41fc-9382-1332bc6e6221︠

/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/salvus/salvus/scripts/bup_storage.py copy_path --overwrite_newer --delete --target_hostname=128.208.178.210:2222 --target_project_id=6cd832d3-c523-41e3-9e54-c8f2d2e8fa2a --path=tmp2/bar2 3702601d-9fbc-4e4e-b7ab-c10a79e34d3b

︠96501170-b4a8-4fb1-ba9f-aef9aebfc96e︠
/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/salvus/salvus/scripts/bup_storage.py copy_path --target_hostname=128.208.178.210:2222 --target_project_id=6cd832d3-c523-41e3-9e54-c8f2d2e8fa2a --path=tmp2 3702601d-9fbc-4e4e-b7ab-c10a79e34d3b
︠013c504c-815d-4708-bda4-d6959eca16aa︠
os.path.join('/a', 'b/c')
︡b7f63620-63ec-4400-8865-c4f18098e0bb︡{"stdout":"'/a/b/c'\n"}︡
︠3e5a0971-5be0-46e5-8e78-8d13e63977b5︠
2
︡bbfc019f-1e65-4b53-a0c7-ead05cc51f49︡{"stdout":"2\n"}︡
︠28dc4727-0f6e-4af9-a6c2-3614308536e2︠
os.path.join('/a', '/b;/c')
︡bc2ebe1f-83c7-4f53-b315-509a79a6e3bb︡{"stdout":"'/b;/c'\n"}︡
︠e44fa0df-86ab-4d72-946b-c2e6b1f7e4c8︠
os.path.abspath(os.path.join('/a', 'b/../c'))
︡ea495ef7-3e3b-4223-9a66-ba8e3d340167︡{"stdout":"'/a/c'\n"}︡
︠e4c96907-46cb-4ab3-967c-dd8b2bc7b863︠

︠a6b6ef87-d8ce-4d55-8f5e-085e806ef827︠
for n in [1..7]+[10..21]:
    print "ssh cloud%s -p 2222 hostname"%n
︡0e86f43f-5eae-44ea-8d01-4c75cc7bdf35︡{"stdout":"ssh cloud1 -p 2222 hostname\nssh cloud2 -p 2222 hostname\nssh cloud3 -p 2222 hostname\nssh cloud4 -p 2222 hostname\nssh cloud5 -p 2222 hostname\nssh cloud6 -p 2222 hostname\nssh cloud7 -p 2222 hostname\nssh cloud10 -p 2222 hostname\nssh cloud11 -p 2222 hostname\nssh cloud12 -p 2222 hostname\nssh cloud13 -p 2222 hostname\nssh cloud14 -p 2222 hostname\nssh cloud15 -p 2222 hostname\nssh cloud16 -p 2222 hostname\nssh cloud17 -p 2222 hostname\nssh cloud18 -p 2222 hostname\nssh cloud19 -p 2222 hostname\nssh cloud20 -p 2222 hostname\nssh cloud21 -p 2222 hostname\n"}︡
︠98a0a834-338c-4629-9867-c0575c4867ea︠

︡a3bd7b43-083c-4602-99a8-6bff1bffa842︡
︠a2bb594c-e7b1-4d4e-aeab-d37014ac399f︠
v = [ '89aaf9d8-bb68-4dde-9202-f62bf4e3741e',
  '3fe4dd69-d376-441b-be5a-a6291e3b1795',
  'fc1a7910-606a-4f6f-bb8b-47417c90b1d0',
  'a026fa5b-af2e-4874-abdf-baff6820ed6c',
  '5ae0f791-083c-4875-8217-66e466e052c1',
  '629d202e-792b-4a3a-9968-b21046327c37',
  '336c9927-7654-45bf-865b-fa22fae11aa9',
  '0b4b6a5f-49a2-4858-be1d-0a5dab66a069',
  'c2ca3fb9-c7ef-476b-a7f9-26abe9360772',
  'f3e04795-3510-41c5-aa00-e8b70eec89ef',
  'c26db83a-7fa2-44a4-832b-579c18fac65f',
  '008ea2ba-da5b-440e-aeaa-4d46a5265d3b',
  '577d7fac-32ee-415f-af7d-5ed98615f960',
  '0892c479-d17a-44d2-abeb-40fd2ff16e86',
  'e2876af9-b728-4243-ad6d-631af1d36ef2',
  '3aa77c8e-2771-437a-a300-3f680a22b564' ]
for x in v:
    print "bup_storage.py start %s"%x
︡f406031d-f98d-46c7-a43e-b638cba7611a︡{"stdout":"bup_storage.py start 89aaf9d8-bb68-4dde-9202-f62bf4e3741e\nbup_storage.py start 3fe4dd69-d376-441b-be5a-a6291e3b1795\nbup_storage.py start fc1a7910-606a-4f6f-bb8b-47417c90b1d0\nbup_storage.py start a026fa5b-af2e-4874-abdf-baff6820ed6c\nbup_storage.py start 5ae0f791-083c-4875-8217-66e466e052c1\nbup_storage.py start 629d202e-792b-4a3a-9968-b21046327c37\nbup_storage.py start 336c9927-7654-45bf-865b-fa22fae11aa9\nbup_storage.py start 0b4b6a5f-49a2-4858-be1d-0a5dab66a069\nbup_storage.py start c2ca3fb9-c7ef-476b-a7f9-26abe9360772\nbup_storage.py start f3e04795-3510-41c5-aa00-e8b70eec89ef\nbup_storage.py start c26db83a-7fa2-44a4-832b-579c18fac65f\nbup_storage.py start 008ea2ba-da5b-440e-aeaa-4d46a5265d3b\nbup_storage.py start 577d7fac-32ee-415f-af7d-5ed98615f960\nbup_storage.py start 0892c479-d17a-44d2-abeb-40fd2ff16e86\nbup_storage.py start e2876af9-b728-4243-ad6d-631af1d36ef2\nbup_storage.py start 3aa77c8e-2771-437a-a300-3f680a22b564\n"}︡
︠9fe335fb-f203-47bc-bb1b-eddde4df11ac︠
os.getpid()
︡968d3f80-f682-47cd-8fd1-489b9cdbc168︡{"stdout":"21986\n"}︡
︠f7e7d0c3-9f2a-4a50-b731-77809e85cbb6︠
1200/41.
︡93244617-493a-41de-89ed-2f5ec88a03e6︡{"stdout":"29.2682926829268\n"}︡
︠31b56df3-9205-4041-8824-ece94e2d0428︠
41 * 30
︡e8e84336-7d3c-4b2b-ab27-d7cac8e48067︡{"stdout":"1230\n"}︡
︠bb40f47e-10f9-47a0-90fb-90fcf81bf586︠
(17 + 5 + 7)*41
︡c6462361-e09a-4b91-ba67-463764bdf9f0︡{"stdout":"1189\n"}︡
︠7530fa1b-6042-4c5f-90c2-2edf14513810︠
6^30
︡0d2d7e7b-dbdd-41da-878e-a1a1a4ced998︡{"stdout":"221073919720733357899776\n"}︡
︠bcc61373-40b8-4b04-9d1b-b2892be8ea65︠
36^15
︡a591eec7-3c29-4201-9d82-3181fa01809e︡{"stdout":"221073919720733357899776\n"}︡
︠16e83c37-6f9e-4eb0-81a7-e3d9a8b44d47︠
len("cleft cam synod lacy yr wok")
︡9a56a95b-f1b8-448a-bd9a-ff3f5011a9d7︡{"stdout":"27\n"}︡
︠21018c2f-f56a-41e0-b829-f0fb715f89c9︠

︠ec20bdde-e961-417a-8b17-6bdd9bedc3a7︠
1.02^32
︡df9b8928-334a-4439-9a22-d5058af50fef︡{"stdout":"1.88454059210113\n"}︡
︠064966fc-c156-4ded-8d59-7b1c6e5118a9︠
ten = 6*24*3; ten
hour = 24*5; hour
monthly = 30; monthly
ten  + hour + monthly
︡5d091b40-013f-464b-a10f-6c83ee8921cf︡{"stdout":"432\n"}︡{"stdout":"120\n"}︡{"stdout":"30\n"}︡{"stdout":"582\n"}︡
︠f13e51d5-fb5c-443a-806b-c2ca338e302a︠
qepcad('(E x)[a x + b > 0]', vars='(a,b,x)')
︡796bd414-84be-4316-b5cc-b23abc6eded0︡{"stderr":"Error in lines 1-1\n"}︡{"stderr":"Traceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 736, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"/usr/local/sage/sage-6.2.rc2/local/lib/python2.7/site-packages/sage/interfaces/qepcad.py\", line 1408, in qepcad\n    qe = Qepcad(formula, vars=vars, **kwargs)\n  File \"/usr/local/sage/sage-6.2.rc2/local/lib/python2.7/site-packages/sage/interfaces/qepcad.py\", line 766, in __init__\n    qex._send('[ input from Sage ]')\n  File \"/usr/local/sage/sage-6.2.rc2/local/lib/python2.7/site-packages/sage/interfaces/expect.py\", line 208, in _send\n    self._start()\n  File \"/usr/local/sage/sage-6.2.rc2/local/lib/python2.7/site-packages/sage/interfaces/expect.py\", line 448, in _start\n    raise RuntimeError(\"Unable to start %s\"%self.name())\nRuntimeError: Unable to start QEPCAD\n"}︡
︠8704d669-8007-4946-8863-8c22dedf05d5︠
 446353 + 30517 - 50
︡9adb8638-9162-4f77-b7e4-541309c7ff6f︡{"stdout":"476820\n"}︡
︠0b7b4021-6188-4403-b143-ce71b4469333︠
%md
    pvresize --setphysicalvolumesize 1907280 /dev/sdc5

︠81d22522-0178-4bea-811d-0b6814931bca︠
476820*4
︡3c5120fa-f0a4-418a-b469-0f49e67c5760︡{"stdout":"1907280\n"}︡
︠798f6d2f-3b6d-48a6-8315-ad797d470900︠
30517 / 120. / 5
︡16ede5a9-169d-418f-8359-88ceedfd0d67︡{"stdout":"50.8616666666667\n"}︡
︠77bcadf6-b94c-4d57-b4a2-fb843c394486︠

︠6d24c838-c9e0-4fdb-9c57-1c1b0aa83bdc︠
import sage_server
︡942c6c6d-94ac-422b-97d2-f03ef38f2883︡
︠1787cafb-6863-452a-be46-a7401c40ab5b︠
sage_server.MAX_TEX_SIZE =
︡5ee535b9-9a5d-4400-9cf8-64d8165874dd︡{"stdout":"2000\n"}︡
︠768955d4-f674-450a-9bb2-ceeafe55354c︠
len(latex(random_matrix(RDF, 20, 20)))
︡64c674fb-3db4-4566-902e-b66b4071cc2e︡{"stdout":"7099"}︡{"stdout":"\n"}︡
︠64c9213d-5295-449b-b696-b1f5ef00b415︠
sage_server.MAX_TEX_SIZE =10000
︡2bcc4bf2-b282-4412-a43d-36797f4be3dd︡
︠fdaf7cee-8ed6-475c-a9dd-caf11d5610d9︠
show(random_matrix(RDF, 20, 20))
︠34df67cd-3a20-428a-a0d4-98aef8ad6942︠
%coffeescript
print MathJax.version
︡dc146191-052e-4076-9916-03c17a782442︡{"javascript":{"coffeescript":true,"code":"print MathJax.version\n"}}︡
︠dd8bce67-1f92-48b7-8ca3-cefa8f4a4d1b︠
%coffeescript
t = require('misc').walltime()
print t, t^2
︡c5d9d68f-ac1f-4457-914e-ceee96d9c99e︡{"javascript":{"coffeescript":true,"code":"t = require('misc').walltime()\nprint t, t^2\n\n"}}︡
︠eb601761-f584-4e03-94c6-4b3484243517︠
N(log(144*10^16,2))
︡7cb6ce7c-5c3b-4f03-9559-1492f0c92c06︡{"stdout":"60.3207745196401\n"}︡
︠07387739-d9de-4732-aeb0-fd0db1b1dc16︠
2^60
︡0463ba11-7e10-49fc-9be3-3a27f4d418e6︡{"stdout":"1152921504606846976\n"}︡
︠36254ebc-d65b-4417-a902-b3b3d179e9f9︠
N(log(1073741824,2))
︡ae3a221f-6f31-4dbd-ab88-16d080f93d1f︡{"stdout":"30.0000000000000\n"}︡
︠27908491-e9f7-4c24-b3e4-a9178a8c380c︠
64*2^30
︡aa460eb5-b8bc-4ec2-ac3e-8a0e81dca9ac︡{"stdout":"68719476736\n"}︡
︠296bccb7-7207-4eb5-85e3-058ca3af1a93︠
256*2^30
︡f3d194ba-469e-4379-932c-94e72049e7c3︡{"stdout":"274877906944\n"}︡
︠a5cd6c9c-2dda-4906-ae9e-693e0b20d7f6︠

︠8debeb00-0a8b-4b07-9852-ffa3948f9378︠
for x in '146.148.10.83 199.223.234.31 162.222.176.40 162.222.182.154 23.251.156.150 23.251.157.130 162.222.183.50 23.236.49.245'.split():
    print "rsync -axH --delete /usr/local/julia/ %s:/usr/local/julia/ && ssh %s 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&"%(x,x)
︡5dbfb1f6-526a-442c-af4c-81c8d4664aae︡{"stdout":"rsync -axH --delete /usr/local/julia/ 146.148.10.83:/usr/local/julia/ && ssh 146.148.10.83 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 199.223.234.31:/usr/local/julia/ && ssh 199.223.234.31 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 162.222.176.40:/usr/local/julia/ && ssh 162.222.176.40 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 162.222.182.154:/usr/local/julia/ && ssh 162.222.182.154 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 23.251.156.150:/usr/local/julia/ && ssh 23.251.156.150 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 23.251.157.130:/usr/local/julia/ && ssh 23.251.157.130 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 162.222.183.50:/usr/local/julia/ && ssh 162.222.183.50 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\nrsync -axH --delete /usr/local/julia/ 23.236.49.245:/usr/local/julia/ && ssh 23.236.49.245 'umask 022; cd /usr/local/julia; make clean; make -j16 install'&\n"}︡
︠38ae0e9e-e0d5-439f-97b8-167cedff456b︠
%coffeescript

for i in [0...20]
    print [i, i+10]
︡3e4b7c76-69ac-49a6-bd70-2c9b1338da5a︡{"javascript":{"coffeescript":true,"code":"\nfor i in [0...20]\n    print [i, i+10]\n"}}︡
︠81a5959f-88fa-4201-bee0-fa7114199aef︠
%coffeescript
print 2394 + 393
︡7c206b93-2331-4149-bd9e-3d90baa95383︡{"javascript":{"coffeescript":true,"code":"print 2394 + 393\n"}}︡
︠85721045-7a65-43cb-a3ed-2b2818202e7d︠
%md(hide=false)
# Foo
## bar

What is up?
sdafdsf

test

asdlkfjasdf
︡ac4e1789-d67d-4888-a225-fe358336732d︡{"md":"# Foo\n## bar\n\nWhat is up?\nsdafdsf\n\ntest\n\nasdlkfjasdf\n"}︡
︠4ac4bc23-7ba6-437c-8800-85f2da7c180e︠

︠d4a3159a-d27d-4bf2-a347-aac719adeb9d︠

︠acae1c0e-5c6d-453e-b64d-ca9f1a498d6d︠
p = next_prime(10^10); q = next_prime(10^11)
a = sqrt(p^2*q)/p; a
︡9e6e5bb8-88c2-4055-94cd-26017ed3a27e︡{"stdout":"1/10000000019*sqrt(10000000038300000037240000001083)\n"}︡
︠a299ccb0-54fb-4381-badf-c46ec35d5a24︠
%time a.rational_simplify()
︡82212a4a-5ba5-4801-99f6-6e4310772d59︡{"stdout":"1/10000000019*sqrt(10000000038300000037240000001083)"}︡{"stdout":"\n"}︡{"stdout":"CPU time: 1.12 s, Wall time: 3.52 s\n"}︡
︠909ada32-adbe-41e4-b3b9-06d1ccea10ff︠
%time factor(p^2*q)
︡d5a9524e-bb04-47ed-b2a8-d5b6c8c55e92︡{"stdout":"10000000019^2 * 100000000003\n"}︡{"stdout":"CPU time: 0.00 s, Wall time: 0.03 s\n"}︡
︠c502c582-b591-4a6d-b43c-65ad6e122886︠
p = next_prime(10^70); q = next_prime(10^72)
sqrt(p^2*q)/p

︡fe5a2d10-04e3-474c-bf38-226dd4552b13︡{"stdout":"1/10000000000000000000000000000000000000000000000000000000000000000000033*sqrt(100000000000000000000000000000000000000000000000000000000000000000000663900000000000000000000000000000000000000000000000000000000000000001114740000000000000000000000000000000000000000000000000000000000000000042471)\n"}︡
︠dba1615f-8e0e-4ee6-a2ba-3421e6df714a︠
p^2*q
︡c6b799f8-bfd4-46dc-b073-2cef2fbbc596︡{"stdout":"100000000000000000000000000000000000000000000000000000000000000000000663900000000000000000000000000000000000000000000000000000000000000001114740000000000000000000000000000000000000000000000000000000000000000042471\n"}︡
︠8580fe1e-78ed-4d77-9baa-41d14f56a2cc︠
walltime()
︡5688080b-5994-4a44-82bc-8c4f6e4201d0︡{"stdout":"1404148110.844422\n"}︡
︠e4f39245-b927-42ba-855f-0f1b99ce8c68︠
2+3
︡02ee3860-8054-4c5a-a3f0-5b592deb1848︡{"stdout":"5\n"}︡
︠36b0784a-a4aa-44ba-97c1-839b6b73022a︠
30000*16
︡577b9c8e-c70e-477c-92c2-1cf79ebf1761︡{"stdout":"480000\n"}︡
︠168398b6-6c00-4fb4-85ba-d67cc10d1f4d︠
87 + 94 + 107 + 100 + 139 + 86 + 84
︡937c908c-22cd-4dba-90d7-3c7d10ca5589︡{"stdout":"697\n"}︡
︠84f75c24-d05d-4c76-9075-ef7a0ea0f48c︠
salvus.link('devel.term')
︡e08ce868-1c8b-44b8-9565-5d14f75ff657︡{"html":"<a class='' style='cursor:pointer'; id='0426d7fe-3153-41aa-83db-0b6ce1deff23'></a>"}︡{"obj":"{\"path\": \"salvus/notes/devel.term\", \"foreground\": true, \"label\": \"devel.term\"}","javascript":{"coffeescript":false,"code":"$('#0426d7fe-3153-41aa-83db-0b6ce1deff23').html(obj.label).click(function() {worksheet.project_page.open_file({'path':obj.path, 'foreground': obj.foreground});; return false;});"},"once":false}︡
︠f4995bfc-1556-4293-a60a-b9bbaef925e6︠
400*19
︡32099dce-312a-42d9-8d05-0fa1b650add3︡{"stdout":"7600\n"}︡
︠64ee28d4-6052-4b7a-8097-f99723847f88︠
181*20
︡8d90e1fd-2fbb-49ba-9516-1e5ee1653e54︡{"stdout":"3620\n"}︡
︠2e56c35d-5bf1-4ac7-9d99-3aa9b82e067d︠
18*492
︡3e45d64e-cc57-40c0-bf0b-02be5d275738︡{"stdout":"8856\n"}︡
︠20852d07-ca11-4de4-947f-a3601926ce2d︠
GF(1)
︡3b236769-9d6b-40e2-b6ee-fde87945238a︡{"stderr":"Error in lines 1-1\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 733, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"factory.pyx\", line 362, in sage.structure.factory.UniqueFactory.__call__ (sage/structure/factory.c:1225)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/sage/rings/finite_rings/constructor.py\", line 370, in create_key_and_extra_args\n    raise ValueError(\"the order of a finite field must be > 1.\")\nValueError: the order of a finite field must be > 1.\n"}︡
︠e3924003-4633-4379-ad2c-368b314e0f76︠
matrix(Zmod(1),0)^(-1)
︡cc1e0290-85f5-4abe-a260-b86e02518336︡{"stdout":"[]"}︡{"stdout":"\n"}︡
︠0fa7e31f-419e-4835-879c-ff4360a13f15︠
A^(-1)
︡bf96956d-3a82-452f-a918-11f3e0bdfcbd︡{"stdout":"[]"}︡{"stdout":"\n"}︡
︠8b5af596-554e-45b1-af9c-2cc989fcc419︠
A.nrows()
︡0c84689d-f932-43c1-949c-ef873b34a01c︡{"stdout":"0\n"}︡
︠94faed59-7edc-4cbf-8eb8-172eecac025b︠
A.kernel()
︡fff7982f-e854-4cc4-84ca-67c46b6e6f43︡{"stderr":"Error in lines 1-1\n"}︡{"stderr":"Traceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 733, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"matrix2.pyx\", line 3751, in sage.matrix.matrix2.Matrix.left_kernel (sage/matrix/matrix2.c:19463)\n  File \"matrix2.pyx\", line 3594, in sage.matrix.matrix2.Matrix.right_kernel (sage/matrix/matrix2.c:19066)\n"}︡{"stderr":"  File \"matrix2.pyx\", line 3227, in sage.matrix.matrix2.Matrix.right_kernel_matrix (sage/matrix/matrix2.c:18459)\nNotImplementedError: Cannot compute a matrix kernel over Ring of integers modulo 1\n"}︡
︠4254b8f7-c14d-4113-9883-c9174fd23902︠
aIntegerModRing(1)
︡c0370c7c-db8a-4bcf-a9a5-a466a30c55e0︡{"stdout":"Ring of integers modulo 1"}︡{"stdout":"\n"}︡
︠ab5fb9f6-c47d-4d33-8712-2413cf4edaae︠
{42, SR(42)}
︡c148dbb4-9e00-461a-b213-1812ba90fe6c︡{"stdout":"set([42])"}︡{"stdout":"\n"}︡
︠6404c714-dd91-4dc5-bd16-9f42c00282b7︠
octave.eval('2+3')
︡ef480237-1a0e-496c-89dd-bf92386027b2︡{"stdout":"'ans = 5'"}︡{"stdout":"\n"}︡
︠44c80c8e-2cca-48d0-9eb7-9cdd0933f612︠
import oct2py
oc = oct2py.Oct2Py()
x = oc.zeros(3,3)
print x, x.dtype
︡eeb70431-bc6b-488c-86bd-24111d3a5bc4︡{"stderr":"Error in lines 3-3\n"}︡{"stderr":"Traceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 733, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/oct2py/session.py\", line 476, in __getattr__\n    doc = self._get_doc(name)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/oct2py/session.py\", line 442, in _get_doc\n    exist = self._eval('exist {0}'.format(name), log=False, verbose=False)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/oct2py/session.py\", line 395, in _eval\n    timeout=timeout)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/oct2py/session.py\", line 620, in evaluate\n    resp = self.expect(['\\x03', 'syntax error'])\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/oct2py/session.py\", line 691, in expect\n    self.proc.expect(strings)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/pexpect.py\", line 916, in expect\n    return self.expect_list(compiled_pattern_list, timeout, searchwindowsize)\n  File \"/usr/local/sage/sage-6.2.rc0/local/lib/python2.7/site-packages/pexpect.py\", line 982, in expect_list\n    raise EOF (str(e) + '\\n' + str(self))\nEOF: End Of File (EOF) in read_nonblocking(). Exception style platform.\n<pexpect.spawn instance at 0xa310560>\nversion: 2.0 ($Revision: 1.151 $)\ncommand: /projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/bin/octave\nargs: ['/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/bin/octave', '-q', '--braindead']\npatterns:\n    \u0003\n    syntax error\nbuffer (last 100 chars): \nbefore (last 100 chars): try\r\ndisp(char(3))\r\nexist zeros\r\ndisp(char(3))\r\ncatch\r\ndisp(lasterr())\r\ndisp(char(21))\r\nend\r\n\nafter: <class 'pexpect.EOF'>\nmatch: None\nmatch_index: None\nexitstatus: None\nflag_eof: 1\npid: 14850\nchild_fd: 7\ntimeout: 1000000\ndelimiter: <class 'pexpect.EOF'>\nlogfile: None\nmaxread: 2000\nsearchwindowsize: None\ndelaybeforesend: 0.1\n"}︡
︠2c0b3e6c-83ff-45b2-8e21-8e5c3b3ac844︠
s= "038c2836-22d9-4966-a1c1-241aac491844, 0e91d83b-e378-44d8-82d2-a2be16cca902, 10066a87-5d27-4e1b-aa1b-a6222c23aedb, 107e3edd-67b2-4b76-acd7-2feef03f5f37, 1662db63-73aa-4298-8780-49781d241095, 35649d30-4772-44f1-8a75-0832d22e9343, 6374f2e1-8f53-446e-a7f2-21c274198fdd, 81fb2b84-d3c2-4b7d-b145-cab9ac68697e, aad15cb6-9dcd-435a-a517-f9145a5d48a3, d5c4380d-32e6-4138-ac01-b541e2ea5dba, dabd438a-5e36-4813-a886-01969b1ff81a, ee65195f-5c15-40eb-a299-1b92f4e64288"
︡430088fa-9a9f-4226-804e-b8995b115fab︡
︠22f25b62-1b42-40c9-bdab-c52c969d5c59︠
s.replace(',','')
︡74df9129-b245-46a3-a5a8-777c6c434594︡{"stdout":"'038c2836-22d9-4966-a1c1-241aac491844 0e91d83b-e378-44d8-82d2-a2be16cca902 10066a87-5d27-4e1b-aa1b-a6222c23aedb 107e3edd-67b2-4b76-acd7-2feef03f5f37 1662db63-73aa-4298-8780-49781d241095 35649d30-4772-44f1-8a75-0832d22e9343 6374f2e1-8f53-446e-a7f2-21c274198fdd 81fb2b84-d3c2-4b7d-b145-cab9ac68697e aad15cb6-9dcd-435a-a517-f9145a5d48a3 d5c4380d-32e6-4138-ac01-b541e2ea5dba dabd438a-5e36-4813-a886-01969b1ff81a ee65195f-5c15-40eb-a299-1b92f4e64288'\n"}︡
︠b9a8c320-8ee9-4406-b0c5-05cc162050f8︠
s="""0b4b6a5f-49a2-4858-be1d-0a5dab66a069
15dbd3ea-135c-4b20-b3f3-2df210c7e8c7
186493da-0eff-43fb-b64e-6bcc854b325b
203717f1-ca2f-430e-87ae-6f34ef470b41
2309f92b-2780-49bb-99db-ffa25205f0c3
3049cc4e-cb80-404d-b918-c00a37655718
3370e874-2ec2-4fa0-b734-830be5454c2c
42374f3e-cc7c-4764-9a9a-bc7dca812d33
48099d72-a9f0-4090-a4a5-a5681b612222
4c32755d-7fa9-48b3-a68a-ec0bd6a44f69
4d8e463f-66e9-44b6-b9af-15207098d2c6
549a2b7f-7ecc-4d07-8a22-83ea5cbd3d68
5e2c44aa-8b9c-42c7-ac4d-5e37aebe8947
66fb5a40-bba6-4021-97de-2420ebc0e6e3
6c4babc4-5fe9-470e-ad8e-56ee5bd3998e
6cc9b011-9f7a-4768-9f65-a7e3ac570c66
6d51cf65-b068-420f-a25f-f5bec28fc8ec
6e87fa6e-59d2-4bda-bd8d-1bd5f71f8292
70e0e4f6-0afa-4aad-af80-07b2d31c1ec6
741fb650-cb46-469a-be47-befe9db6ed8a
8b0fd725-b29e-4dc2-9620-71ed1091f4f1
8c262c23-6371-48fc-ae40-7baf328dee8c
8cc874b5-81c5-42be-84f4-18eca620abaa
8dcc8fad-a597-41b5-9415-e78601fba7e8
9fe03eb3-3e5e-4004-a017-e1fc8881c73f
a026fa5b-af2e-4874-abdf-baff6820ed6c
a46969fe-7903-4920-af5c-3fe72a7148d8
b5e24be5-33cb-4532-be65-69fd3d4c2930
c99a1b55-fb7b-42e5-8452-b348d34f1626
cbad405b-324d-4f4d-be76-920e7a1ab741
cc96c0e6-8daf-467d-b8d2-354f9c5144a5
ccafd9db-83ee-493a-a953-eb3341fb48d9
d0747513-8879-4b0a-acbe-5db8b7358d39
e08f061e-462d-4251-84bd-fdc0f66cccb6
e33a3ee0-46a6-4e4b-87a6-fb370bab7c2a
e3f11587-0e9e-46de-b420-dbc99113b018
e8000e54-2cdf-4f6d-8cdb-b3b5af10bb73
f114f80b-95a5-4558-a46f-029d29990a35
f6358ea6-6e95-4984-9771-be608f90f157
f9d131d4-2a61-40a8-abdf-6063cfa8faf1
"""
︡762c8d9b-8814-43c7-ac7b-d29dfbce5cd6︡
︠e237d782-0355-4d52-909a-bb1e9db540f9︠

for a in s.splitlines():
    print "fusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/%s"%a
︡fb88a019-b23d-431e-8dd1-a1bad9b60a1f︡{"stdout":"fusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/0b4b6a5f-49a2-4858-be1d-0a5dab66a069\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/15dbd3ea-135c-4b20-b3f3-2df210c7e8c7\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/186493da-0eff-43fb-b64e-6bcc854b325b\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/203717f1-ca2f-430e-87ae-6f34ef470b41\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/2309f92b-2780-49bb-99db-ffa25205f0c3\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/3049cc4e-cb80-404d-b918-c00a37655718\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/3370e874-2ec2-4fa0-b734-830be5454c2c\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/42374f3e-cc7c-4764-9a9a-bc7dca812d33\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/48099d72-a9f0-4090-a4a5-a5681b612222\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/4c32755d-7fa9-48b3-a68a-ec0bd6a44f69\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/4d8e463f-66e9-44b6-b9af-15207098d2c6\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/549a2b7f-7ecc-4d07-8a22-83ea5cbd3d68\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/5e2c44aa-8b9c-42c7-ac4d-5e37aebe8947\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/66fb5a40-bba6-4021-97de-2420ebc0e6e3\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/6c4babc4-5fe9-470e-ad8e-56ee5bd3998e\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/6cc9b011-9f7a-4768-9f65-a7e3ac570c66\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/6d51cf65-b068-420f-a25f-f5bec28fc8ec\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/6e87fa6e-59d2-4bda-bd8d-1bd5f71f8292\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/70e0e4f6-0afa-4aad-af80-07b2d31c1ec6\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/741fb650-cb46-469a-be47-befe9db6ed8a\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/8b0fd725-b29e-4dc2-9620-71ed1091f4f1\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/8c262c23-6371-48fc-ae40-7baf328dee8c\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/8cc874b5-81c5-42be-84f4-18eca620abaa\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/8dcc8fad-a597-41b5-9415-e78601fba7e8\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/9fe03eb3-3e5e-4004-a017-e1fc8881c73f\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/a026fa5b-af2e-4874-abdf-baff6820ed6c\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/a46969fe-7903-4920-af5c-3fe72a7148d8\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/b5e24be5-33cb-4532-be65-69fd3d4c2930\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/c99a1b55-fb7b-42e5-8452-b348d34f1626\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/cbad405b-324d-4f4d-be76-920e7a1ab741\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/cc96c0e6-8daf-467d-b8d2-354f9c5144a5\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/ccafd9db-83ee-493a-a953-eb3341fb48d9\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/d0747513-8879-4b0a-acbe-5db8b7358d39\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/e08f061e-462d-4251-84bd-fdc0f66cccb6\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/e33a3ee0-46a6-4e4b-87a6-fb370bab7c2a\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/e3f11587-0e9e-46de-b420-dbc99113b018\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/e8000e54-2cdf-4f6d-8cdb-b3b5af10bb73\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/f114f80b-95a5-4558-a46f-029d29990a35\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/f6358ea6-6e95-4984-9771-be608f90f157"}︡{"stdout":"\nfusermount -u /projects/74af30b7-ad25-4308-a02e-c71fcd84de6e/students/f9d131d4-2a61-40a8-abdf-6063cfa8faf1\n"}︡
︠47443843-351a-4f74-8c2e-8182a6ca4686︠
s="""projects-10.1.10.5
projects-10.1.11.5
projects-10.1.12.5
projects-10.1.14.5
projects-10.1.1.5
projects-10-1.15.5
projects-10.1.15.5
projects-10.1.16.5
projects-10.1.17.5
projects-10.1.18.5
projects-10.1.19.5
projects-10.1.20.5
projects-10.1.21.5
projects-10.1.3.5
projects-10.1.4.5
projects-10.1.5.5
projects-10.1.6.5
projects-10.1.7.5
projects-10.3.1.4
projects-10.3.1.5
projects-10.3.2.4
projects-10.3.2.5
projects-10.3.3.4
projects-10.3.3.5
projects-10.3.5.4
projects-10.3.5.5
projects-10.3.6.4
projects-10.3.6.5
projects-10.3.7.4
projects-10.3.7.5
projects-10.3.8.4
projects-10.3.8.5"""
for a in s.splitlines():
    print "fusermount -u -z /%s"%a
︡0d65d9a7-8262-4971-84f3-d7a3ee7af653︡{"stdout":"fusermount -u -z /projects-10.1.10.5\nfusermount -u -z /projects-10.1.11.5\nfusermount -u -z /projects-10.1.12.5\nfusermount -u -z /projects-10.1.14.5\nfusermount -u -z /projects-10.1.1.5\nfusermount -u -z /projects-10-1.15.5\nfusermount -u -z /projects-10.1.15.5\nfusermount -u -z /projects-10.1.16.5\nfusermount -u -z /projects-10.1.17.5\nfusermount -u -z /projects-10.1.18.5\nfusermount -u -z /projects-10.1.19.5\nfusermount -u -z /projects-10.1.20.5\nfusermount -u -z /projects-10.1.21.5\nfusermount -u -z /projects-10.1.3.5\nfusermount -u -z /projects-10.1.4.5\nfusermount -u -z /projects-10.1.5.5\nfusermount -u -z /projects-10.1.6.5\nfusermount -u -z /projects-10.1.7.5\nfusermount -u -z /projects-10.3.1.4\nfusermount -u -z /projects-10.3.1.5\nfusermount -u -z /projects-10.3.2.4\nfusermount -u -z /projects-10.3.2.5\nfusermount -u -z /projects-10.3.3.4\nfusermount -u -z /projects-10.3.3.5\nfusermount -u -z /projects-10.3.5.4\nfusermount -u -z /projects-10.3.5.5\nfusermount -u -z /projects-10.3.6.4\nfusermount -u -z /projects-10.3.6.5\nfusermount -u -z /projects-10.3.7.4\nfusermount -u -z /projects-10.3.7.5\nfusermount -u -z /projects-10.3.8.4\nfusermount -u -z /projects-10.3.8.5\n"}︡
︠89728dc8-d428-450c-9ea7-a33e408834a2︠
%md

as root

  apt-get install gdal-bin libgdal-dev libgdal-doc libgdal-java libgdal-perl libgdal1-dev libgdal1h  python3-gdal

as salvus

umask 022
sage -sh
export CPLUS_INCLUDE_PATH=/usr/include/gdal
export C_INCLUDE_PATH=/usr/include/gdal
pip install gdal

︠31c1b983-be32-4e3b-8725-0be989185e27︠
3600*24
︡219ec796-6fc6-45f2-894b-fa2b3646757f︡{"stdout":"86400\n"}︡
︠f17fb657-bd3a-406d-8086-500e9f36c5ab︠
862/60.
︡beb7b874-efcb-488a-ba7c-d1e167a15554︡{"stdout":"14.3666666666667\n"}︡
︠e41aa49d-4a45-42fe-acd8-5491497ea0fa︠
s="""10.3.1.5 compute1dc2 compute-2 gce
10.3.2.5 compute2dc2 compute-2 gce
10.3.3.5 compute3dc2 compute-2 gce
10.3.4.5 compute4dc2 compute-2 gce
10.3.5.5 compute5dc2 compute-2 gce
10.3.6.5 compute6dc2 compute-2 gce
10.3.7.5 compute7dc2 compute-2 gce
10.3.8.5 compute8dc2 compute-2 gce

10.3.1.1 backup1dc2

10.3.1.2 cassandra1dc2 cassandra gce
10.3.2.2 cassandra2dc2 cassandra gce
10.3.3.2 cassandra3dc2 cassandra gce
10.3.4.2 cassandra4dc2 cassandra gce

10.3.1.3 web1dc2 hub gce
10.3.2.3 web2dc2 hub gce

10.4.1.5 compute1dc3 compute-2 gce

10.4.1.2 cassandra1dc3 cassandra gce
10.4.2.2 cassandra2dc3 cassandra gce
10.4.3.2 cassandra3dc3 cassandra gce
10.4.4.2 cassandra4dc3 cassandra gce

10.4.1.3 web1dc3 hub gce
10.4.2.3 web2dc3 hub gce"""
for k in s.splitlines():
    a = k.split()
    if len(a) >= 2:
        print "time ./vm_gce.py %s config_tinc --ip_address %s %s"%('--zone=europe-west1-b' if a[1][-1] == '3' else '', a[0], a[1])

︡c102b213-9506-43d3-876e-273dd1292333︡{"stdout":"time ./vm_gce.py  config_tinc --ip_address 10.3.1.5 compute1dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.2.5 compute2dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.3.5 compute3dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.4.5 compute4dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.5.5 compute5dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.6.5 compute6dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.7.5 compute7dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.8.5 compute8dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.1.1 backup1dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.1.2 cassandra1dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.2.2 cassandra2dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.3.2 cassandra3dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.4.2 cassandra4dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.1.3 web1dc2\ntime ./vm_gce.py  config_tinc --ip_address 10.3.2.3 web2dc2\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.1.5 compute1dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.1.2 cassandra1dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.2.2 cassandra2dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.3.2 cassandra3dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.4.2 cassandra4dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.1.3 web1dc3\ntime ./vm_gce.py --zone=europe-west1-b config_tinc --ip_address 10.4.2.3 web2dc3\n"}︡
︠f0cb5e1c-ae30-4832-aa19-8a17b1b79478︠
for k in s.splitlines():
    a = k.split()
    if len(a) > 0:
        print a[0],
︡2999a1dc-f054-4a74-9c73-2187ad4be6af︡{"stdout":"10.3.1.5 10.3.2.5 10.3.3.5 10.3.4.5 10.3.5.5 10.3.6.5 10.3.7.5 10.3.8.5 10.3.1.1 10.3.1.2 10.3.2.2 10.3.3.2 10.3.4.2 10.3.1.3 10.3.2.3 10.4.1.5 10.4.1.2 10.4.2.2 10.4.3.2 10.4.4.2 10.4.1.3 10.4.2.3"}︡
︠4c1c901f-5249-42cb-9d0e-bb7e9f5ad4ee︠

︠b6f88144-876e-4d8d-9711-a8f23b2c317d︠
0.04 * 1000
︡6a9a136d-9621-4537-8f42-edfbc2aeb7b4︡{"stdout":"40.0000000000000\n"}︡
︠45eb6e50-fd2b-4951-bd7c-848c34b8ead8︠
%default_mode gap
︡81047ccb-b044-4efa-84ee-11bb23dcbfcd︡
︠29d7734d-40e0-4cab-ae5f-908ec38b87dc︠
for i in range(1,8) + range(10,22):
    print " scp compute1dc2 cloud%s:salvus/salvus/conf/tinc_hosts/"%i

︡49ca4043-10c8-4fcc-9bcc-88ca9f64015d︡{"stdout":" scp compute1dc2 cloud1:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud2:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud3:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud4:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud5:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud6:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud7:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud10:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud11:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud12:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud13:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud14:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud15:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud16:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud17:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud18:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud19:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud20:salvus/salvus/conf/tinc_hosts/\n scp compute1dc2 cloud21:salvus/salvus/conf/tinc_hosts/\n"}︡
︠73ff0399-fcda-4dc4-8c5c-3b0515ea1a37︠

︠37caff6f-e2c5-4ee0-bc6b-989ff16d9e2b︠
s="""0b4b6a5f-49a2-4858-be1d-0a5dab66a069
15dbd3ea-135c-4b20-b3f3-2df210c7e8c7
186493da-0eff-43fb-b64e-6bcc854b325b
203717f1-ca2f-430e-87ae-6f34ef470b41
2309f92b-2780-49bb-99db-ffa25205f0c3
3049cc4e-cb80-404d-b918-c00a37655718
3370e874-2ec2-4fa0-b734-830be5454c2c
42374f3e-cc7c-4764-9a9a-bc7dca812d33
48099d72-a9f0-4090-a4a5-a5681b612222
4c32755d-7fa9-48b3-a68a-ec0bd6a44f69
4d8e463f-66e9-44b6-b9af-15207098d2c6
549a2b7f-7ecc-4d07-8a22-83ea5cbd3d68
5e2c44aa-8b9c-42c7-ac4d-5e37aebe8947
66fb5a40-bba6-4021-97de-2420ebc0e6e3
6c4babc4-5fe9-470e-ad8e-56ee5bd3998e
6cc9b011-9f7a-4768-9f65-a7e3ac570c66
6d51cf65-b068-420f-a25f-f5bec28fc8ec
6e87fa6e-59d2-4bda-bd8d-1bd5f71f8292
70e0e4f6-0afa-4aad-af80-07b2d31c1ec6
741fb650-cb46-469a-be47-befe9db6ed8a
8b0fd725-b29e-4dc2-9620-71ed1091f4f1
8c262c23-6371-48fc-ae40-7baf328dee8c
8cc874b5-81c5-42be-84f4-18eca620abaa
8dcc8fad-a597-41b5-9415-e78601fba7e8
9fe03eb3-3e5e-4004-a017-e1fc8881c73f
a026fa5b-af2e-4874-abdf-baff6820ed6c
a46969fe-7903-4920-af5c-3fe72a7148d8
b5e24be5-33cb-4532-be65-69fd3d4c2930
c99a1b55-fb7b-42e5-8452-b348d34f1626
cbad405b-324d-4f4d-be76-920e7a1ab741
cc96c0e6-8daf-467d-b8d2-354f9c5144a5
ccafd9db-83ee-493a-a953-eb3341fb48d9
d0747513-8879-4b0a-acbe-5db8b7358d39
e08f061e-462d-4251-84bd-fdc0f66cccb6
e33a3ee0-46a6-4e4b-87a6-fb370bab7c2a
e3f11587-0e9e-46de-b420-dbc99113b018
e8000e54-2cdf-4f6d-8cdb-b3b5af10bb73
f114f80b-95a5-4558-a46f-029d29990a35
f6358ea6-6e95-4984-9771-be608f90f157
f9d131d4-2a61-40a8-abdf-6063cfa8faf1"""
for a in s.splitlines():
    print "fusermount -u %s"%a
︡f7fa1f71-a7eb-410a-91e8-8cc59bd86577︡{"stdout":"fusermount -u 0b4b6a5f-49a2-4858-be1d-0a5dab66a069\nfusermount -u 15dbd3ea-135c-4b20-b3f3-2df210c7e8c7\nfusermount -u 186493da-0eff-43fb-b64e-6bcc854b325b\nfusermount -u 203717f1-ca2f-430e-87ae-6f34ef470b41\nfusermount -u 2309f92b-2780-49bb-99db-ffa25205f0c3\nfusermount -u 3049cc4e-cb80-404d-b918-c00a37655718\nfusermount -u 3370e874-2ec2-4fa0-b734-830be5454c2c\nfusermount -u 42374f3e-cc7c-4764-9a9a-bc7dca812d33\nfusermount -u 48099d72-a9f0-4090-a4a5-a5681b612222\nfusermount -u 4c32755d-7fa9-48b3-a68a-ec0bd6a44f69\nfusermount -u 4d8e463f-66e9-44b6-b9af-15207098d2c6\nfusermount -u 549a2b7f-7ecc-4d07-8a22-83ea5cbd3d68\nfusermount -u 5e2c44aa-8b9c-42c7-ac4d-5e37aebe8947\nfusermount -u 66fb5a40-bba6-4021-97de-2420ebc0e6e3\nfusermount -u 6c4babc4-5fe9-470e-ad8e-56ee5bd3998e\nfusermount -u 6cc9b011-9f7a-4768-9f65-a7e3ac570c66\nfusermount -u 6d51cf65-b068-420f-a25f-f5bec28fc8ec\nfusermount -u 6e87fa6e-59d2-4bda-bd8d-1bd5f71f8292\nfusermount -u 70e0e4f6-0afa-4aad-af80-07b2d31c1ec6\nfusermount -u 741fb650-cb46-469a-be47-befe9db6ed8a\nfusermount -u 8b0fd725-b29e-4dc2-9620-71ed1091f4f1\nfusermount -u 8c262c23-6371-48fc-ae40-7baf328dee8c\nfusermount -u 8cc874b5-81c5-42be-84f4-18eca620abaa\nfusermount -u 8dcc8fad-a597-41b5-9415-e78601fba7e8\nfusermount -u 9fe03eb3-3e5e-4004-a017-e1fc8881c73f\nfusermount -u a026fa5b-af2e-4874-abdf-baff6820ed6c\nfusermount -u a46969fe-7903-4920-af5c-3fe72a7148d8\nfusermount -u b5e24be5-33cb-4532-be65-69fd3d4c2930\nfusermount -u c99a1b55-fb7b-42e5-8452-b348d34f1626\nfusermount -u cbad405b-324d-4f4d-be76-920e7a1ab741\nfusermount -u cc96c0e6-8daf-467d-b8d2-354f9c5144a5\nfusermount -u ccafd9db-83ee-493a-a953-eb3341fb48d9\nfusermount -u d0747513-8879-4b0a-acbe-5db8b7358d39\nfusermount -u e08f061e-462d-4251-84bd-fdc0f66cccb6\nfusermount -u e33a3ee0-46a6-4e4b-87a6-fb370bab7c2a\nfusermount -u e3f11587-0e9e-46de-b420-dbc99113b018\nfusermount -u e8000e54-2cdf-4f6d-8cdb-b3b5af10bb73\nfusermount -u f114f80b-95a5-4558-a46f-029d29990a35\nfusermount -u f6358ea6-6e95-4984-9771-be608f90f157\nfusermount -u f9d131d4-2a61-40a8-abdf-6063cfa8faf1\n"}︡
︠85ec7835-b48a-4171-b53b-5375c6adc4de︠
%octave
m = [1,2,3]
m = [1,2,3]
m = [1,2,3]
m = [1,2,3]
m = [1,2,3]

︡0123b18e-9bf2-408c-a5a7-3a19e2c64033︡{"stdout":"m =\n\n 1 2 3\n\n\nm =\n\n 1 2 3\n\n\nm =\n\n 1 2 3\n\n\nm = [1,2,3]\nm = [1,2,3]\nm = [1,2,3]\nm =\n\n 1 2 3\n\n\nm =\n\n 1 2 3\n\n"}︡
︠509d30ae-dc64-4df4-961d-da9f800e2544︠
%octave
m
︡25175624-5c1c-47f3-a90e-dfaaf567052b︡{"stdout":"\n 1 2 3\n\n"}︡
︠785ebf33-2577-464b-b7ec-7f5dcf51ab2f︠
import os
for project_id in os.listdir('/bup/projects'):
    if project_id != '9cacf3b5-a40a-4b93-8c1c-ba3c9176f0c1':
        os.system("killall -9 -u %s"%project_id.replace('-',''))
        os.system("cp -v /bup/projects/%s/* /projects/%s/"%(project_id, project_id))
︡6ceee57b-ca54-4cc0-a8db-bb3643590365︡{"stderr":"Error in lines 2-5\nTraceback (most recent call last):\n  File \"/projects/3702601d-9fbc-4e4e-b7ab-c10a79e34d3b/.sagemathcloud/sage_server.py\", line 733, in execute\n    exec compile(block+'\\n', '', 'single') in namespace, locals\n  File \"\", line 1, in <module>\nOSError: [Errno 13] Permission denied: '/bup/projects'\n"}︡
︠952bcde4-f939-4f07-b3e4-3fd3b3e8842d︠




︠54b95da4-c421-45f8-8101-63d16d740eba︠
40000/1647. * 5 / 24.
︡645709da-df98-4ca4-a2c7-f5c79802ceb0︡{"stdout":"5.05970451325643\n"}︡
︠c5643636-46b3-4009-8b11-91beb57a76e1︠
for i in [3..7]:
     print "echo 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra"
     print "time /usr/bin/bup on 10.1.%s.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23"%i
     print "time /usr/bin/bup on 10.1.%s.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.%s.1-storage-storage_chunks-2014-03-23"%(i,i)
     print "echo 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra"

︡c73b7871-4232-45e0-9d2e-c71cab26f7ff︡{"stdout":"echo 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\ntime /usr/bin/bup on 10.1.3.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23\ntime /usr/bin/bup on 10.1.3.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.3.1-storage-storage_chunks-2014-03-23\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\ntime /usr/bin/bup on 10.1.4.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23\ntime /usr/bin/bup on 10.1.4.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.4.1-storage-storage_chunks-2014-03-23\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\ntime /usr/bin/bup on 10.1.5.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23\ntime /usr/bin/bup on 10.1.5.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.5.1-storage-storage_chunks-2014-03-23\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\ntime /usr/bin/bup on 10.1.6.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23\ntime /usr/bin/bup on 10.1.6.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.6.1-storage-storage_chunks-2014-03-23\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\ntime /usr/bin/bup on 10.1.7.1 index /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23\ntime /usr/bin/bup on 10.1.7.1 save /home/salvus/vm/images/storage/storage/storage_chunks/snapshots/2014-03-23 -n 10.1.7.1-storage-storage_chunks-2014-03-23\necho 'USAGE'; du -sch /home/salvus/vm/images/bup-cassandra\n"}︡
︠d4cfa9d9-d818-4ffe-bd39-417bb339e15e︠
for i in [10..21]:
    print "rsync -axvH root@10.1.%s.6:/tmp/bup/ /home/salvus/bup/"%i
︡4073b9be-0936-42a0-93b1-055df5eb3198︡{"stdout":"rsync -axvH root@10.1.10.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.11.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.12.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.13.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.14.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.15.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.16.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.17.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.18.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.19.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.20.6:/tmp/bup/ /home/salvus/bup/\nrsync -axvH root@10.1.21.6:/tmp/bup/ /home/salvus/bup/\n"}︡
︠97c6095b-7f77-4933-912f-e59ac718a2ca︠

︠2c802e0f-3502-41d5-9e2a-1f8597e2f9d3︠
for i in [10..21]:
    print "scp 10.1.%s.4 10.1.%s.6:/tmp/projects_on_host"%(i,i)
︡c1fbfa04-b8a5-44c6-914d-86d33879b323︡{"stdout":"scp 10.1.10.4 10.1.10.6:/tmp/projects_on_host\nscp 10.1.11.4 10.1.11.6:/tmp/projects_on_host\nscp 10.1.12.4 10.1.12.6:/tmp/projects_on_host\nscp 10.1.13.4 10.1.13.6:/tmp/projects_on_host\nscp 10.1.14.4 10.1.14.6:/tmp/projects_on_host\nscp 10.1.15.4 10.1.15.6:/tmp/projects_on_host\nscp 10.1.16.4 10.1.16.6:/tmp/projects_on_host\nscp 10.1.17.4 10.1.17.6:/tmp/projects_on_host\nscp 10.1.18.4 10.1.18.6:/tmp/projects_on_host\nscp 10.1.19.4 10.1.19.6:/tmp/projects_on_host\nscp 10.1.20.4 10.1.20.6:/tmp/projects_on_host\nscp 10.1.21.4 10.1.21.6:/tmp/projects_on_host\n"}︡
︠8dc280a9-914a-4526-838f-2758272d121c︠
for i in [11..21]:
    print "cloud%s  {'hostname':'bup%s',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}"%(i,i)
︡65a24ff3-56ca-4d5b-8606-9975a6c46167︡{"stdout":"cloud11  {'hostname':'bup11',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud12  {'hostname':'bup12',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud13  {'hostname':'bup13',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud14  {'hostname':'bup14',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud15  {'hostname':'bup15',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud16  {'hostname':'bup16',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud17  {'hostname':'bup17',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud18  {'hostname':'bup18',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud19  {'hostname':'bup19',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud20  {'hostname':'bup20',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\ncloud21  {'hostname':'bup21',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':baset, 'disk':'projects:512:none:qcow2', 'vnc':13200}\n"}︡
︠e234a4cb-10a3-47fa-bbc2-c5140724515d︠
' '.join(['10.1.%s.6'%i for i in [10..21]])
︡2bb4e2ee-5584-410a-a262-3945876dbab3︡{"stdout":"'10.1.10.6 10.1.11.6 10.1.12.6 10.1.13.6 10.1.14.6 10.1.15.6 10.1.16.6 10.1.17.6 10.1.18.6 10.1.19.6 10.1.20.6 10.1.21.6'\n"}︡
︠d94ae589-8c7c-4b52-85b6-8a0a6efb1110︠
for i in [12..21]:
    print "10.1.%s.6 kvm bup bup%s"%(i,i)
︡ef16f372-0463-45db-b673-5f3646053664︡{"stdout":"10.1.12.6 kvm bup bup12\n10.1.13.6 kvm bup bup13\n10.1.14.6 kvm bup bup14\n10.1.15.6 kvm bup bup15\n10.1.16.6 kvm bup bup16\n10.1.17.6 kvm bup bup17\n10.1.18.6 kvm bup bup18\n10.1.19.6 kvm bup bup19\n10.1.20.6 kvm bup bup20\n10.1.21.6 kvm bup bup21\n"}︡
︠9553cd9b-ec46-4d12-bf3f-93f9ddfae0fe︠
s=""" 5
             3
             2
             3
             3
             3
             3
             5
             3
             3
             3
             1
             3
             2
             2
             2
             3
             3
             5"""
sum([int(x) for x in s.split()])

︡88a8a1f0-8afb-48af-876c-994771d17640︡{"stdout":"57\n"}︡
︠e246c997-2eeb-4b3d-bca5-07375dce77b0︠
2+2
︡e99c8154-f067-4cfd-b58f-0c4af13584b1︡{"stdout":"4\n"}︡
︠98766a34-02f4-44d7-9e39-b404fa956085︠
for i in [11..21]:
    print "cloud%s  {'hostname':'compute%sdc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}"%(i,i,)
︡bf64e0a2-bcfe-4bc7-9be6-b76b30ab2a31︡{"stdout":"cloud11  {'hostname':'compute11dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud12  {'hostname':'compute12dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud13  {'hostname':'compute13dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud14  {'hostname':'compute14dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud15  {'hostname':'compute15dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud16  {'hostname':'compute16dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud17  {'hostname':'compute17dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud18  {'hostname':'compute18dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud19  {'hostname':'compute19dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud20  {'hostname':'compute20dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\ncloud21  {'hostname':'compute21dc0',  'vcpus':newcompute_cpu,   'ram':newcompute_ram,   'base':base, 'disk':'storage:512:none:qcow2', 'vnc':13100}\n"}︡
︠09286e60-b240-4b1d-a434-199822207541︠
37268.49/103
︡ce4ee9c7-eb2c-4e85-8de4-27a40f06d18b︡{"stdout":"361.830000000000\n"}︡
︠7c6a50ea-a8e3-492b-a86e-97aae0934bf4︠
60*24
︡e7ef5938-dbbd-46fb-a7c1-602fdcf1e5a4︡{"stdout":"1440\n"}︡
︠96011aa4-4624-4dbe-ac99-cc5f9eb84d9e︠
2800/172. * 1.5
︡5dde92fb-e603-4451-9643-43a0084864c1︡{"stdout":"24.4186046511628\n"}︡
︠e892e68f-3399-4dd2-bbf2-b8adce2533b3︠
1400/60.0
︡6e8d1085-04c6-4e1f-942c-4f594a21cbb0︡{"stdout":"23.3333333333333\n"}︡
︠bf6772a8-1587-466e-aab2-3ca7d7c34380︠
import numpy

︡e5f1514b-a7f1-486a-9b30-dfadab757945︡
︠18b7aaef-645f-4fcf-b552-ff1928d4c070︠
a = numpy.array([[[0,2],[0,1]],[[0,1],[0,1]],[[0,1],[0,1]],[[0,1],[0,1]]],ndmin=3)
a
︡2ca58069-3ba0-4951-92a3-8e62451ea5ed︡{"stdout":"array([[[0, 2],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]]])\n"}︡
︠de0f7362-ffd7-42f9-a7ec-43f3c9c4b1d9︠
a*a
︡ded57b02-826e-4a79-b78e-f77024251458︡{"stdout":"array([[[0, 4],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]],\n\n       [[0, 1],\n        [0, 1]]])\n"}︡
︠ee0f8c39-d0ae-4bf3-b6d1-4707d3794bdb︠
numpy.dot(a,a)
︡32ce35a8-a9ce-45ce-841f-155b6ac96e8b︡{"stdout":"array([[[[0, 2],\n         [0, 2],\n         [0, 2],\n         [0, 2]],\n\n        [[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]]],\n\n\n       [[[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]],\n\n        [[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]]],\n\n\n       [[[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]],\n\n        [[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]]],\n\n\n       [[[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]],\n\n        [[0, 1],\n         [0, 1],\n         [0, 1],\n         [0, 1]]]])\n"}︡
︠0321c382-c061-42cc-b5d7-1ffc0895087a︠
numpy.array?
︡523e64a9-d3b0-4641-a8fc-cf59476957e0︡{"stdout":"Unable to read source filename (<built-in function array> is not a module, class, method, function, traceback, frame, or code object)   Docstring:\n   array(object, dtype=None, copy=True, order=None, subok=False, ndmin=0)\n\n   Create an array.\n\n   object : array_like\n      An array, any object exposing the array interface, an object\n      whose __array__ method returns an array, or any (nested)\n      sequence.\n\n   dtype : data-type, optional\n      The desired data-type for the array.  If not given, then the\n      type will be determined as the minimum type required to hold the\n      objects in the sequence.  This argument can only be used to\n      'upcast' the array.  For downcasting, use the .astype(t) method.\n\n   copy : bool, optional\n      If true (default), then the object is copied.  Otherwise, a copy\n      will only be made if __array__ returns a copy, if obj is a\n      nested sequence, or if a copy is needed to satisfy any of the\n      other requirements (dtype, order, etc.).\n\n   order : {'C', 'F', 'A'}, optional\n      Specify the order of the array.  If order is 'C' (default), then\n      the array will be in C-contiguous order (last-index varies the\n      fastest).  If order is 'F', then the returned array will be in\n      Fortran-contiguous order (first-index varies the fastest).  If\n      order is 'A', then the returned array may be in any order\n      (either C-, Fortran-contiguous, or even discontiguous).\n\n   subok : bool, optional\n      If True, then sub-classes will be passed-through, otherwise the\n      returned array will be forced to be a base-class array\n      (default).\n\n   ndmin : int, optional\n      Specifies the minimum number of dimensions that the resulting\n      array should have.  Ones will be pre-pended to the shape as\n      needed to meet this requirement.\n\n   out : ndarray\n      An array object satisfying the specified requirements.\n\n   empty, empty_like, zeros, zeros_like, ones, ones_like, fill\n\n   >>> np.array([1, 2, 3])\n   array([1, 2, 3])\n\n   Upcasting:\n\n   >>> np.array([1, 2, 3.0])\n   array([ 1.,  2.,  3.])\n\n   More than one dimension:\n\n   >>> np.array([[1, 2], [3, 4]])\n   array([[1, 2],\n          [3, 4]])\n\n   Minimum dimensions 2:\n\n   >>> np.array([1, 2, 3], ndmin=2)\n   array([[1, 2, 3]])\n\n   Type provided:\n\n   >>> np.array([1, 2, 3], dtype=complex)\n   array([ 1.+0.j,  2.+0.j,  3.+0.j])\n\n   Data-type consisting of more than one element:\n\n   >>> x = np.array([(1,2),(3,4)],dtype=[('a','<i4'),('b','<i4')])\n   >>> x['a']\n   array([1, 3])\n\n   Creating an array from sub-classes:\n\n   >>> np.array(np.mat('1 2; 3 4'))\n   array([[1, 2],\n          [3, 4]])\n\n   >>> np.array(np.mat('1 2; 3 4'), subok=True)\n   matrix([[1, 2],\n           [3, 4]])\n"}︡{"stdout":"\n"}︡
︠18e3ce31-58fd-4843-a26f-5b7b89acbd98︠
%octave
a = rand(2)
a
︡bb6dc784-3dce-41bb-900c-ce9e45a85869︡{"stdout":"a =\n\n 0.592749 0.701623\n 0.0698126 0.474876\n\n\na =\n\n 0.592749 0.701623\n 0.0698126 0.474876\n\n"}︡
︠2dce7ff1-4d18-40f6-abe7-a36c2196b8eb︠
%octave
a*a
︡2fb80f22-2da0-49ab-80c1-0da3d0c7a780︡{"stdout":"ans =\n\n 0.400334 0.74907\n 0.0745337 0.274489\n\n"}︡
︠edeb2d8f-b1c4-4869-b46b-c740c319f1ce︠
0.592749*0.59 + 0.7*0.07
︡c731e57a-bb9e-415d-927b-011c434d2fe1︡{"stdout":"0.398721910000000\n"}︡
︠21695366-8b45-446b-8236-51f1cc32e85e︠
0.592749 *0.592749
︡3f1ea937-6aa2-4710-bc6d-ab28890a250a︡{"stdout":"0.351351377001000\n"}︡
︠c3a2a80b-505e-470d-ab4d-3bf6c1b88239︠
37000/27000.
︡8ccd9bfc-887e-4b8e-a577-1741da262a12︡{"stdout":"1.37037037037037\n"}︡
︠292e38da-0478-43f6-a78e-61086b4de60c︠
270*1.4 - 270
︡5c028d6c-20ff-4028-beb6-4f0e5fbe63b3︡{"stdout":"108.000000000000\n"}︡
︠25e6210c-50d6-4f6f-b4dd-a7ba18b0d0a1︠
1400/80.


︡cb2f5abd-f44b-4fbb-897a-37eefb8fabf5︡{"stdout":"17.5000000000000\n"}︡
︠ad4198e6-98f5-4dc1-b6f8-32b082198f8fi︠
md(open('business.md').read())
︡7d85bf28-23bf-4e87-82ed-ba56a77fa359︡{"html":"<h1><em>Implementing</em> Business Models Ideas for SMC</h1>\n\n<p>The point of this document is to list various proposed business models, then try to figure out exactly what is involved in implementing them and how long it would take.  That&#8217;s it.</p>\n\n<h2>Parameters</h2>\n\n<p>There are many parameters&#8230;</p>\n\n<ul>\n<li><p>[ ] storing limits how?\n&#8211; limits for each user could be stored in the accounts table in a mapping called &#8220;limits&#8221;.</p>\n\n<ul>\n<li>What happens when a given &#8220;plan&#8221; changes? Do I run through the whole database and update all limits maps?  That doesn&#8217;t scale well and could lead to problems.\n&#8211; could have a table called &#8220;plans&#8221;, with columns:\n    plan_id    name      description     {public_projects:?, private_projects:?, publishing:?, total_ram:?, &#8230;}\nand a pointer to a <code>plan_id</code> in the accounts table.  (I think I already did this.)\nCode would then cache the plans in memory (for a while), which reduces the db hits when doing operations a <em>lot</em>.\nThis means users have to have plans rather than directly paying for changing specific limits.  It&#8217;s not clear\nwhich is the better approach.   It&#8217;s the old cell phone thing of &#8220;pay for what you use&#8221; versus &#8220;buy a contract/plan&#8221;.\nPay as you go is generally considered more consumer friendly, but is I guess harder to implement technically\nand possibly less predictable revenue wise.</li>\n</ul></li>\n<li><p>[ ] (1:30?) number of public/private projects</p>\n\n<ul>\n<li>[ ] (0:45?) cassandra &#8211; when creating a new project check the number of projects the account owns.  If it exceeds the limit, return an error instead of creating the project.</li>\n<li>[ ] (0:45?) display an error message in the client, with link to page about how to increase limits.</li>\n</ul></li>\n<li><p>[ ] publishing content publicly &#8211; let&#8217;s say a &#8220;worksheet&#8221; to fix ideas.</p>\n\n<ul>\n<li><p>[ ] take a worksheet and generates a directory with index.html that can display said worksheet, assuming the SMC page content has been loaded already.  Then serve this via a static server.  Problem: as SMC changes, this code will break.  Rebuilding things may be impossible.  Also will require another specialized service to serve.   Pro: efficient.</p></li>\n<li><p>[ ] If client tries to access a path into <em>public</em> project and the file is <em>world-readable</em>, then they are granted read-only document access, using what I already implemented.  blobs are automatically just served (so images).</p></li>\n<li>[ ] Make it easier in the UI to tell whether or not a directory is world readable and/or set it to be world-readable.  For example, have a share button, which (1) changes permissions, and (2) provides the url to the most recent snapshot (possibly making a new one).</li>\n<li>[ ] Optimization: Any time somebody views this document, it would have to start the project using current code, which is BAD.  However, I can easily modify code so that for grabbing a document that will be read-only, instead of starting all the server stuff, we just mount the ZFS filesystem (if not mounted), and directly grab the file via scp (say) or NFS or even something unencrypted, which is much more lightweight.   Or maybe we only start the local hub and nothing else (no sage server, console server, etc.).</li>\n</ul></li>\n<li><p>[ ] total memory usage by a project</p>\n\n<ul>\n<li>[ ] store project memory limit in projects table entry.</li>\n<li>[ ] when starting a project have option to create a new cgroup for that user (modify my create_project_user.py script)</li>\n<li>[ ] pass in parameters to the script, which we get from the database</li>\n</ul></li>\n<li><p>[ ] total cpu usage by a project</p></li>\n<li><p>[ ] disk space available to a project</p></li>\n<li><p>[ ] number of snapshots</p></li>\n<li><p>[ ] number of collaborators in a project</p></li>\n<li><p>[ ] amount of unused time until project is forcefully closes</p></li>\n<li><p>[ ] network access: MB uploaded, MB downloaded, blocked ip&#8217;s</p></li>\n</ul>\n\n<h2>Features</h2>\n\n<ul>\n<li><p>[ ] homework grading workflow</p></li>\n<li><p>[ ] port forwarding</p></li>\n<li><p>[ ] a group of users get access to a specific commercial sotware install (e.g., Mathematics, Magma, etc.)</p></li>\n<li><p>[ ] assistance management tools for teaching a class: create accounts for students, send them emails, etc.</p></li>\n<li><p>[ ] dedicated database hosted as part of SMC</p></li>\n<li><p>[ ] attach large amounts of disk space to a project via NFS, maybe even shared across several projects&#8230;</p></li>\n</ul>\n"}︡
︠ce54c279-02d9-4597-b30e-aa94601cd228︠
︡dc86d6da-b8a1-42b0-bb6f-04e5b6e556c2︡
︠6b638e38-cc37-4d02-b3f5-c29c18e9e437︠









