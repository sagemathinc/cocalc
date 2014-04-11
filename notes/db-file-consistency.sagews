︠9274bad5-6d6d-4cc7-a74f-bb555ae00936︠
hosts ="""10.1.21.5 795a90e2-92e0-4028-afb0-0c3316c48192
10.3.3.4 8f5247e5-d449-4356-9ca7-1d971c79c7df
10.1.2.5 a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e
 10.1.14.5  e682408b-c165-4635-abef-d0c5809fee26
 10.1.12.5  eec826ad-f395-4a1d-bfb1-20f5a19d4bb0
  10.3.2.4  f71dab5b-f40c-48db-a3d2-eefe6ec55f01
 10.3.6.4  0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc
 10.1.16.5  0985aa3e-c5e9-400e-8faa-32e7d5399dab
 10.1.17.5  2d7f86ce-14a3-41cc-955c-af5211f4a85e
 10.1.19.5  3056288c-a78d-4f64-af21-633214e845ad
  10.1.1.5  306ad75d-ffe0-43a4-911d-60b8cd133bc8
  10.3.8.4  44468f71-5e2d-4685-8d60-95c9d703bea0
  10.1.3.5  4e4a8d4e-4efa-4435-8380-54795ef6eb8f
  10.1.4.5  630910c8-d0ef-421f-894e-6f58a954f215
 10.1.18.5  767693df-fb0d-41a0-bb49-a614d7fbf20d
 10.1.21.5  795a90e2-92e0-4028-afb0-0c3316c48192
 10.1.20.5  801019d9-008a-45d4-a7ce-b72f6e99a74d
  10.3.5.4  806edbba-a66b-4710-9c65-47dd70503fc9
  10.3.3.4  8f5247e5-d449-4356-9ca7-1d971c79c7df
  10.3.4.4  94d4ebc1-d5fc-4790-affe-ab4738ca0384
 10.1.11.5  9e43d924-684d-479b-b601-994e17b7fd86
  10.1.2.5  a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e
 10.1.15.5  b9cd6c52-059d-44e1-ace0-be0a26568713
  10.1.7.5  bc74ea05-4878-4c5c-90e2-facb70cfe338
  10.3.1.4  c2ba4efc-8b4d-4447-8b0b-6a512e1cac97
  10.3.7.4  d0bfc232-beeb-4062-9ad5-439c794594f3
  10.1.6.5  d47df269-f3a3-47ed-854b-17d6d31fa4fd
 10.1.10.5  dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1
  10.1.5.5  e06fb88a-1683-41d6-97d8-92e1f3fb5196
 10.1.13.5  e676bb5a-c46c-4b72-8d87-0ef62e4a5c88"""
host_to_id = dict([a.split() for a in hosts.splitlines()])
id_to_host = dict([(y,x) for x, y in host_to_id.items()])

︡b263e9aa-bd26-43dc-8780-4a57817b2560︡
︠4c3b787f-b51f-4d4f-b85d-6d250ce2ed53︠
#got via this: consistency ALL; SELECT project_id, bup_location, bup_last_save FROM projects LIMIT 50000;
db = {}
for x in open('cloud3/d').readlines()[4:-1]:
    a = x.split('|')
    if len(a) == 3:
        p = a[0].strip()
        loc = a[1].strip()
        locs = set([a.split()[-1] for a in a[2].strip().replace('{',' ').split(': ')[:-1]])
        db[p] = {'locs':locs, 'loc':loc}
︡715fba17-e7de-4a87-b91d-30c0f4205713︡
︠243cccf0-69db-40ad-8466-b39c02a1b6d3︠
len(db)
︡9e835609-853b-41d5-95d9-1acfff3333f4︡{"stdout":"46658\n"}︡
︠cad92adc-4675-40e6-b6eb-03eba076825c︠
len([p for p in db if len(db[p]['locs']) >3])
︡f21c357e-a18c-4fd9-83d3-537f2f2bfd69︡{"stdout":"114"}︡{"stdout":"\n"}︡
︠bf45f00e-1cb0-4692-92b3-883453979628︠
z0 = [p for p in db if len(db[p]['locs']) == 0 and db[p]['loc'] != 'null']
︡381669d6-138d-4f48-9461-7ae844e2a1e1︡
︠f4f0d8d6-cad5-4143-b931-7f11a115006a︠
len(z0)
︡8b07b36c-4e67-4c0b-be34-92dea14ac9b5︡{"stdout":"1\n"}︡
︠2d74043f-fbd1-454d-96f8-0d9edbc89fa6︠
z0[0]
︡a3e0bf31-1a2c-49b8-abcd-4d08c22b8815︡{"stdout":"'e1363b83-517a-4f43-ae8f-15fc4c7764ec'\n"}︡
︠36df274f-589a-4cd3-8d61-b7930d441838︠
hosts(z0[0])
︡8d06f659-8b9e-4075-9ca7-182253e46b64︡{"stdout":"[]\n"}︡
︠5e3c1c8a-815c-4739-b31e-80461465ec2f︠
db[z0[0]]
︡50690f88-b831-4f52-838b-d6845c040560︡{"stdout":"{'locs': set([]), 'loc': '0663ed3c-e943-4d46-8c5e-b5e7bd5a61cc'}\n"}︡
︠7209a67f-85ba-404e-a7ff-0450fff29e0c︠
len([p for p in db if len(db[p]['locs']) <3])
︡e0312abe-cac6-47bd-968d-44ba8aa4d0ba︡{"stdout":"1438"}︡{"stdout":"\n"}︡
︠3410f34f-53a8-4696-b3b8-1d2a5eecdbc0︠
zz = [p for p in db if db[p]['loc'] != 'null' and db[p]['loc'] != set([]) and db[p]['loc'] not in db[p]['locs']];
︡d88ef7e6-cb5e-413e-9d79-f31d67c58611︡
︠84b39226-4bb8-475c-8301-3aedeacaceb9︠
len(zz)
︡1745331c-ec20-4ecf-94ca-faf4c1a58d4a︡{"stdout":"121\n"}︡
︠618c416c-ca24-4d68-9fda-a51251a6891b︠
zz[0]
︡e8aed7c8-d86e-4cd0-a316-5fa82f5003d1︡{"stdout":"'48defaf1-a5a3-4966-b477-9a23c4f25194'\n"}︡
︠433993c5-2ab5-468e-8370-2324a7bfb9c7︠
len(db)
︡528f7d9c-4c5b-4501-97ad-121edd53817c︡{"stdout":"46637\n"}︡
︠8784b19d-afb0-4afe-b621-15695180cc13︠
db[zz[0]]
︡e7375f34-ef1b-46ae-ba79-d026b5cf982a︡{"stdout":"{'locs': set(['e682408b-c165-4635-abef-d0c5809fee26', '630910c8-d0ef-421f-894e-6f58a954f215', 'd0bfc232-beeb-4062-9ad5-439c794594f3']), 'loc': 'd0bfc232-beeb-4062-9ad5-439c794594f3'}\n"}︡
︠bbc96f81-a707-47a3-8145-41ee8cc3fd2a︠
hosts('48defaf1-a5a3-4966-b477-9a23c4f25194')
︡e266ac9b-c216-445f-9c6d-235be2182759︡{"stdout":"['630910c8-d0ef-421f-894e-6f58a954f215', 'd0bfc232-beeb-4062-9ad5-439c794594f3', 'e682408b-c165-4635-abef-d0c5809fee26']\n"}︡
︠56e24fe7-d14f-4cf4-934f-c5607ed9abe8︠
hosts(zz[0])
︡d3450fc0-d163-4c8d-8a8b-07c352070b1b︡{"stdout":"['630910c8-d0ef-421f-894e-6f58a954f215', 'd0bfc232-beeb-4062-9ad5-439c794594f3', 'e682408b-c165-4635-abef-d0c5809fee26']\n"}︡

︠a858b5c4-e212-41b6-a032-e83ff0d70d6d︠

︠0b7d3606-0264-4ab9-b4bd-b2b6c2584dd7︠
id_to_host['d0bfc232-beeb-4062-9ad5-439c794594f3']
︡1cb6083a-162c-48fd-af11-1d0ed1bc1645︡{"stdout":"'10.3.7.4'\n"}︡
︠29b7d8ad-6a00-459c-9b4a-52849bac367d︠
db['3702601d-9fbc-4e4e-b7ab-c10a79e34d3b']
︡2dd78ae0-8103-45e6-bfe4-8d848a399615︡{"stdout":"{'locs': set(['4e4a8d4e-4efa-4435-8380-54795ef6eb8f', 'eec826ad-f395-4a1d-bfb1-20f5a19d4bb0', 'd0bfc232-beeb-4062-9ad5-439c794594f3']), 'loc': '4e4a8d4e-4efa-4435-8380-54795ef6eb8f'}\n"}︡
︠ac5e27d0-9525-4484-bd44-cedc2391886b︠
# PARSE

v = dict([(x, set(open('cloud3/%s'%x).read().split())) for x in  os.listdir('cloud3') if len(x) > 30])
len(v)
︡a608c42a-2f75-44b2-bbef-6a658c6cbada︡{"stdout":"27\n"}︡
︠a833dcec-50ff-45b5-a3db-6dfccadbae8b︠
def hosts(p):
    return [k for k,s in v.iteritems() if p in s]
def hosts2(p):
    return [id_to_host[k] for k in hosts(p)]
def bad_hosts(p):
    return [id_to_host[k] for k in hosts(p) if k not in db[p]['locs']]
def good_hosts(p):
    return [id_to_host[k] for k in hosts(p) if k in db[p]['locs']]
︡f9b57967-67f5-451d-b4fe-e61330691d44︡
︠a04134fa-2dc6-423f-8732-356e53c70086︠

︠89b4945b-60a0-4112-a4ce-02113cfa1db2︠
hosts('6cc9b011-9f7a-4768-9f65-a7e3ac570c66')
︡7947e6b5-3d4d-4333-8429-e436cbeb8147︡{"stdout":"['630910c8-d0ef-421f-894e-6f58a954f215', 'dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1', '8f5247e5-d449-4356-9ca7-1d971c79c7df']\n"}︡
︠d3edc92c-c930-4565-b2fc-bbe6d5c02cef︠
bad_hosts('6cc9b011-9f7a-4768-9f65-a7e3ac570c66')
︡85c76366-5f59-418c-8822-35162a8493d9︡{"stdout":"[]\n"}︡
︠6a7f742f-2a82-471a-b419-42d345730435︠
good_hosts('6cc9b011-9f7a-4768-9f65-a7e3ac570c66')
︡c179fcfb-539e-433a-aa50-23d55c1ba292︡{"stdout":"['10.1.4.5', '10.1.10.5', '10.3.3.4']\n"}︡
︠c9998daa-b2c2-4897-bd5c-6f7b037bc8c9︠
len('6cc9b011-9f7a-4768-9f65-a7e3ac570c66')
︡501089a6-ec52-4c2a-9d67-ad5943a2c007︡{"stdout":"36\n"}︡
︠f57abfb0-b0a6-421c-bc80-923bf1b226b6︠
def all_hosts(p):
    return list(set( hosts(p) + list( db[p]['locs'])))

def merge_files(p):
    a = []
    v = all_hosts(p)

    for h in v[1:]:
        s = "ssh %s 'rsync -axH --update --exclude .snapshots /projects/%s/ %s:/projects/%s/'"%(id_to_host[h],  p, id_to_host[v[0]], p)
        a.append(s)
    for h in v[1:]:
        s = "ssh %s 'rsync -axH --update --exclude .snapshots /projects/%s/ %s:/projects/%s/'"%(id_to_host[v[0]],  p, id_to_host[h], p)
        a.append(s)
    return a


def copy_from_bad_to_master(p):
    a = []
    loc = db[p]['loc']
    if len(loc) != 36:
        raise RuntimeError
    for h in bad_hosts(p):
        s = "ssh %s 'rsync -axH --update --exclude .snapshots /projects/%s/ %s:/projects/%s/'"%(h,  p, id_to_host[loc], p)
        a.append(s)
    hh = list(set( hosts(p) + list( db[p]['locs'])))
    targets = [id_to_host[q] for q in hh if id_to_host[q] != id_to_host[loc]]
    s = "ssh %s 'bup_storage.py sync --targets=%s %s'"%(id_to_host[loc], ','.join(targets), p)
    a.append(s)
    return a

def copy_from_bad_to_master2(p):
    a = []
    loc = db[p]['loc']
    if len(loc) != 36:
        raise RuntimeError
    hh = list(set( hosts(p) + list( db[p]['locs'])))
    targets = [id_to_host[q] for q in hh if id_to_host[q] != id_to_host[loc]]
    s = "ssh %s 'bup_storage.py sync --targets=%s %s'"%(id_to_host[loc], ','.join(targets), p)
    a.append(s)
    return a

def set_bup_last_save(p):
    a = []
    import time
    now = int(time.time()*1000)
    for x in hosts(p):
        s = "UPDATE projects SET bup_last_save[%s]=%s WHERE project_id=%s;"%(x,now,p)
        a.append(s)
    return a


def archive_bad(p):
    a = [ ]
    for h in bad_hosts(p):
        s = "ssh %s 'fusermount -u /projects/%s/.snapshots; mv /projects/%s /bup/trash/%s-%s'"%(h, p, p, p, randrange(0,1000000))
        a.append(s)
    return a

def look_good(p):
    a = []
    for g in good_hosts(p):
        s = "ssh %s 'ls /projects/%s/'"%(g, p)
        a.append(s)
    return a
def look_bad(p):
    a = []
    for g in bad_hosts(p):
        s = "ssh %s 'ls /projects/%s/'"%(g, p)
        a.append(s)
    return a

def look_all(p):
    a = []
    for g in list(set( hosts(p) + list( db[p]['locs']))):
        s = "ssh %s 'ls -lht /projects/%s/'"%(id_to_host[g], p)
        a.append(s)
    return a

︡5f29a131-2131-41ea-9b6f-61c8c1ad220f︡
︠d9dff0a5-fdba-4ea2-989e-02daab7fdaea︠
print '\n'.join(look_all('87e7b598-58ee-4f31-a9f1-0e658c9b582d'))
︡6670db1e-9bb2-4831-a078-acef0ae65aa8︡{"stdout":"ssh 10.1.18.5 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\nssh 10.3.3.4 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\nssh 10.1.17.5 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\nssh 10.1.3.5 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\nssh 10.1.6.5 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\nssh 10.3.8.4 'ls -lht /projects/87e7b598-58ee-4f31-a9f1-0e658c9b582d/'\n"}︡
︠33bc7b58-1ce1-4d92-809d-b01da2b6c5a8︠
p = 'a2fc41fc1-5417-46f8-8141-7b6826473e37'

print "set -v"
print '\n'.join(copy_from_bad_to_good(p))
print '\n'.join(archive_bad(p))
print '\n'.join(look_good(p))
︡0ac90fbf-1eb9-44af-a5a6-9890a65822a7︡{"stdout":"set -v\n"}︡{"stdout":"\n"}︡{"stdout":"\n"}︡{"stdout":"\n"}︡
︠201c22a6-abb7-4223-a68c-dc49b0a438ae︠
db[p]
︡27edb7e3-b661-4ec8-979b-dd80bc56edb7︡{"stdout":"set(['2d7f86ce-14a3-41cc-955c-af5211f4a85e', 'c2ba4efc-8b4d-4447-8b0b-6a512e1cac97', 'a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e'])\n"}︡
︠ae624fc0-7ce7-48d6-8c5f-7de08b676a64︠
hosts(p)
︡c9593427-99cc-427e-bcf5-58b82935a87d︡{"stdout":"['4e4a8d4e-4efa-4435-8380-54795ef6eb8f', 'f71dab5b-f40c-48db-a3d2-eefe6ec55f01', 'dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1', '2d7f86ce-14a3-41cc-955c-af5211f4a85e']\n"}︡
︠0d505f3c-62d2-4924-a6db-b2edf213e633︠
good_hosts(p)
︡8f977a82-2412-4a45-9019-3638df20eb94︡{"stdout":"['10.1.17.5']\n"}︡
︠8cfccdff-a66b-4989-a56d-6cbcb5c0e163︠

w = list(reduce(lambda x,y:x.union(y), [y for x,y in v.items()]))
︡367f2cef-69be-472f-b486-363f3936d450︡
︠e376cbe5-ba47-4a71-9582-d78e6715226c︠
len(w)
︡76a02d5c-361b-4512-8b3b-2c63d0c5c8b8︡{"stdout":"45192\n"}︡
︠c658f38c-3d4a-4cfe-a688-4c15da021602︠
w[0]
︡73676c6e-c434-48e5-9a1c-7d1c23cafc39︡{"stdout":"'a0f92c48-a0bc-48ee-9a8d-fe20b7336411'\n"}︡
︠41dd2659-9271-4e5b-8dd7-4ce114d5b6de︠
# OLD
z = [ (len([a for x in v.items() if a in x[1]]), a)  for a in w]
z.sort()

len([k for k in z if k[0] <= 3])
maybe = [k for k in z if k[0] > 3]
bad = []
for n, p in maybe:
    if len(db[p]['locs']) < n:
        bad.append((n,p))
print "len(bad)=", len(bad)

︡db248e7d-d93e-4ecd-ae8f-e5fd6f877aac︡{"stdout":"45084"}︡{"stdout":"\n"}︡{"stdout":"len(bad)= 0\n"}︡
︠6fadc3cb-755d-45e3-8d40-57f1f8ae61e1︠
bad
︡826cf2e2-e0ae-4f38-bbff-79f8fb2cd3f7︡{"stdout":"[(6, '52c527f9-378a-4ecf-9158-abe34354692f'), (6, '74af30b7-ad25-4308-a02e-c71fcd84de6e'), (6, '87e7b598-58ee-4f31-a9f1-0e658c9b582d'), (6, '987c3972-4cf7-456c-b5da-63f41b26b093'), (6, 'a8140ed7-e9ce-45e8-baa9-25ac38bed58c')]\n"}︡
︠c94196e3-405b-4b5f-ae99-8bfa1bfd259b︠
# NEW
bad = []
for p in db:
    for h in db[p]['locs']:
        if h not in hosts(p):
            bad.append((p,hosts(p), db[p]['locs']))
            break

bad.sort()
print "len(bad)=", len(bad)

︡d90725c7-ae60-45da-a731-9e0c2ae68060︡{"stdout":"len(bad)= 61\n"}︡
︠23d11ed5-7778-4ce0-8875-60b5cd9daf59︠
len([b for b in bad if db[b[0]]['loc'] != 'null'])
︡04b043e5-10f2-437f-a3a0-16b5323b9a44︡{"stdout":"23\n"}︡
︠3f9416ca-fd79-4ae1-bb4b-f992b30579b5︠
print '\n'.join(merge_files(bad[0][0]))
︡27c32e50-ac52-4c7d-bb6f-b243ee8ce8ad︡{"stdout":"ssh 10.3.2.4 'rsync -axH --update --exclude .snapshots /projects/027ef34c-4272-4681-beaf-622c2db0fd46/ 10.1.7.5:/projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\nssh 10.1.10.5 'rsync -axH --update --exclude .snapshots /projects/027ef34c-4272-4681-beaf-622c2db0fd46/ 10.1.7.5:/projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\nssh 10.1.7.5 'rsync -axH --update --exclude .snapshots /projects/027ef34c-4272-4681-beaf-622c2db0fd46/ 10.3.2.4:/projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\nssh 10.1.7.5 'rsync -axH --update --exclude .snapshots /projects/027ef34c-4272-4681-beaf-622c2db0fd46/ 10.1.10.5:/projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\n"}︡
︠64d36d16-660f-4af9-a7a1-99a678ac3cd3︠
go = open('go4','w')
for b in bad[1:]:
    print b[0],
    sys.stdout.flush()
    x = merge_files(b[0])
    s = '\n'.join(x) + '\n'
    go.write(s)
    go.flush()
︡e4498bdf-acc6-4e0e-af52-44e195427695︡{"stdout":"0319ff5b-7700-4700-be52-a1e7f402a0fd"}︡{"stdout":" 03f27872-e5a0-41db-a59d-305a95197369"}︡{"stdout":" 055c5559-c0c6-42dd-ac44-c35782a6ed79"}︡{"stdout":" 0ccf2089-b809-4292-882b-d7a64a9ebf8e"}︡{"stdout":" 0f30d134-afb4-49b5-9ed1-6899165a2374"}︡{"stdout":" 11cec0d9-b80e-47cc-bca8-51fca0b88d24"}︡{"stdout":" 1b014196-1803-466b-ad8a-269a28bc10e3"}︡{"stdout":" 1dc659cb-d481-43c2-8dfa-592a3cff04bb"}︡{"stdout":" 1dc763a3-9362-4c1d-bed0-b6c3db322600"}︡{"stdout":" 22ca0896-d62d-4064-8f01-34f5820233eb"}︡{"stdout":" 32d9f5a2-f8fd-48df-a062-3adc7bc6c448"}︡{"stdout":" 4140f940-8991-4a0b-9268-1a65699cb9e5"}︡{"stdout":" 4ae1fb41-a6c4-4047-9ab1-2457e320bb5d"}︡{"stdout":" 4b8eb833-081c-4f73-8d34-ad3f397e0cb2"}︡{"stdout":" 54011da9-7d86-4968-bbda-e86ed3c70b13"}︡{"stdout":" 55578306-0d99-4895-83fe-561dc5a21c31"}︡{"stdout":" 56f717c5-aba4-42f5-8541-07aeb01d44eb"}︡{"stdout":" 57307902-f79d-435e-ad75-779a2293ad5c"}︡{"stdout":" 5ec07a03-a0dd-4f4e-8a08-96e265caaafc"}︡{"stdout":" 6598fe46-b303-41f6-b6f7-b8b9f26f54c4"}︡{"stdout":" 6e0adc36-0ae4-4bad-a558-15665c020f37"}︡{"stdout":" 76263104-d706-40a5-88f0-71449b31ca01"}︡{"stdout":" 79db1a1e-09f7-4d80-8d05-ee33d8f62637"}︡{"stdout":" 7ee9bf5c-d759-4f7b-9e4a-3d8762bbba9e"}︡{"stdout":" 8162c232-908c-485a-b587-d437c6b88e97"}︡{"stdout":" 844edcb7-fc18-43fe-b4a8-50099fbfa21c"}︡{"stdout":" 85b3416b-d45d-47c5-aa17-63f45b136019"}︡{"stdout":" 86d5de0c-9a6d-443b-a4b3-c7e0ab4f5a44"}︡{"stdout":" 8dcc8fad-a597-41b5-9415-e78601fba7e8"}︡{"stdout":" 918ecae3-0507-43a5-a073-ca352fce2c9e"}︡{"stdout":" 9ca07f88-f2a9-4acd-a2d0-1d3839c0ddfc"}︡{"stdout":" a0ad3115-65a5-41c3-994f-09c369730514"}︡{"stdout":" a1ff7017-41d7-4314-8246-8356434e1dfc"}︡{"stdout":" a68fb063-28d9-4ab1-814d-155e0c90a541"}︡{"stdout":" aa8ee103-d13c-41c5-9bd5-80045514a607"}︡{"stdout":" b04cbf29-913d-4e89-8717-43908a6af9ba"}︡{"stdout":" b10bd069-9589-42e4-8354-404ff03f9b06"}︡{"stdout":" b69bc90a-080a-444a-a2ed-a498ad2ce4ef"}︡{"stdout":" b8080bd1-2536-4af7-afc5-68a9fc6ff299"}︡{"stdout":" b824e462-3c92-4f12-bc8e-bdc664749407"}︡{"stdout":" bb3f9ff1-2686-4ea6-85f6-e733c097aec6"}︡{"stdout":" bf5203a1-9655-4f2d-b404-9be26c1f03d9"}︡{"stdout":" c287c7f0-2255-4f9e-8cb3-21db89a44261"}︡{"stdout":" c5bca6f1-e9c2-41c3-8034-a1b15cfe9005"}︡{"stdout":" cc46d6f7-2280-4290-9e32-560b374a334a"}︡{"stdout":" ccbdefa4-8dfa-48eb-a165-4d52a1d8b5e4"}︡{"stdout":" cdd37051-d3aa-488c-a3e1-248383e1d69a"}︡{"stdout":" ce6ac815-1b6d-4c31-9891-981682371003"}︡{"stdout":" d089bdff-e04b-4387-ba7e-fa195e822442"}︡{"stdout":" d8b5ecad-937d-463f-a9b6-46687d98ad67"}︡{"stdout":" df44c2ea-4f1d-4598-91db-77787010639b"}︡{"stdout":" e5c7c79e-0a56-4463-96e7-24a23f732c48"}︡{"stdout":" e6e73c8f-5034-48a7-a787-b1415c614214"}︡{"stdout":" ed8ff844-81a7-4e51-a10f-1501d995da08"}︡{"stdout":" edf9f4d9-771c-4179-9cd7-1e2203efdf7a"}︡{"stdout":" ee9a4aa3-56da-49e5-b8e1-f10cf8d31a03"}︡{"stdout":" f5aabb40-7430-4492-bd13-350db5e9652d"}︡{"stdout":" f610b8e5-1b7c-4781-b50f-7dfed092526f"}︡{"stdout":" f7ea7e8d-5e70-43c3-bcdb-6933df5b1dca"}︡{"stdout":" ffbfd1f8-a7fb-4ece-8fc9-8fcef7720550"}︡
︠8d0e2a46-fb48-46b7-9d00-7ac6b1fb686f︠
print '\n'.join(look_all(bad[0][0]))
︡e3d9e3bc-a0d5-432c-b93c-a32dd4825782︡{"stdout":"ssh 10.1.7.5 'ls -lht /projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\nssh 10.3.2.4 'ls -lht /projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\nssh 10.1.10.5 'ls -lht /projects/027ef34c-4272-4681-beaf-622c2db0fd46/'\n"}︡
︠2df68656-b33b-4225-97f3-92e860a50004︠
db[bad[0][0]]
︡a2849ac1-0c23-40e7-a951-8ef1c85ffe9b︡{"stdout":"{'locs': set(['bc74ea05-4878-4c5c-90e2-facb70cfe338', 'f71dab5b-f40c-48db-a3d2-eefe6ec55f01', 'dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1']), 'loc': 'null'}\n"}︡
︠eb32612e-1036-4cdc-a663-16bcbd3fa5cc︠

︠fd1d465a-2a56-4df5-bd27-9c3593d2084e︠
hosts('87e7b598-58ee-4f31-a9f1-0e658c9b582d')
︡3fc69623-a188-4448-b795-f6046fa273a4︡{"stdout":"['4e4a8d4e-4efa-4435-8380-54795ef6eb8f', '44468f71-5e2d-4685-8d60-95c9d703bea0', '767693df-fb0d-41a0-bb49-a614d7fbf20d', '2d7f86ce-14a3-41cc-955c-af5211f4a85e', 'd47df269-f3a3-47ed-854b-17d6d31fa4fd', '8f5247e5-d449-4356-9ca7-1d971c79c7df']\n"}︡
︠74f96c0f-1873-4c2c-9600-154fe3454c71︠
db['87e7b598-58ee-4f31-a9f1-0e658c9b582d']
︡e1dd872b-0dca-4e56-a79b-b60e8347d611︡{"stdout":"{'locs': set(['767693df-fb0d-41a0-bb49-a614d7fbf20d', '8f5247e5-d449-4356-9ca7-1d971c79c7df', '2d7f86ce-14a3-41cc-955c-af5211f4a85e', '4e4a8d4e-4efa-4435-8380-54795ef6eb8f', 'd47df269-f3a3-47ed-854b-17d6d31fa4fd', '44468f71-5e2d-4685-8d60-95c9d703bea0']), 'loc': 'd47df269-f3a3-47ed-854b-17d6d31fa4fd'}\n"}︡
︠065e0ab6-8ddb-4bc8-8b85-76695b62f50e︠

︠26c4fe6e-54d8-4783-a740-89c2412bef83︠
print bad[0]
︡84641625-0f90-427c-b5b4-8edde73144b6︡{"stdout":"('00812e3b-bb2c-4fad-952b-56191e995ff5', ['e06fb88a-1683-41d6-97d8-92e1f3fb5196', '795a90e2-92e0-4028-afb0-0c3316c48192', '8f5247e5-d449-4356-9ca7-1d971c79c7df'], set([]))\n"}︡
︠388ddd59-ec13-465d-b781-637a624250f9︠
len([b for b in bad if len(b[1])>3])
︡e4a1d93f-8861-4231-9fc0-4b82d6143ff3︡{"stdout":"5\n"}︡
︠db9ddcfc-e541-48a7-bd22-579a0dbb595e︠

︠8301e8bf-305d-429b-a1fc-800447974396︠
[x for x in bad0 if x[1] == '52c527f9-378a-4ecf-9158-abe34354692f']
︡96ae0c6b-2ca6-4ee0-a5f3-c402d3dbfd30︡{"stdout":"[]\n"}︡
︠eb4a32ed-ad98-487b-b3bc-f9b444ebaaa3︠
print '\n'.join(set_bup_last_save(bad[0][1]))
︡4d4ac644-7068-4b2c-b340-278e3b5d065d︡{"stdout":"UPDATE projects SET bup_last_save[4e4a8d4e-4efa-4435-8380-54795ef6eb8f]=1397229518911 WHERE project_id=2fc41fc1-5417-46f8-8141-7b6826473e37;\nUPDATE projects SET bup_last_save[f71dab5b-f40c-48db-a3d2-eefe6ec55f01]=1397229518911 WHERE project_id=2fc41fc1-5417-46f8-8141-7b6826473e37;\nUPDATE projects SET bup_last_save[dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1]=1397229518911 WHERE project_id=2fc41fc1-5417-46f8-8141-7b6826473e37;\nUPDATE projects SET bup_last_save[2d7f86ce-14a3-41cc-955c-af5211f4a85e]=1397229518911 WHERE project_id=2fc41fc1-5417-46f8-8141-7b6826473e37;\n"}︡
︠0869114c-8e14-473f-a240-ed78dde2e178︠
go = open('go','w')
for b in bad:
    print b[1]
    x = copy_from_bad_to_master(b[1])
    s = '\n'.join(x) + '\n'
    go.write(s)
    go.flush()

︡c7f8250b-6829-488e-b7b7-d80d52d0913a︡{"stdout":"52c527f9-378a-4ecf-9158-abe34354692f\n74af30b7-ad25-4308-a02e-c71fcd84de6e\n87e7b598-58ee-4f31-a9f1-0e658c9b582d\n987c3972-4cf7-456c-b5da-63f41b26b093\na8140ed7-e9ce-45e8-baa9-25ac38bed58c\n"}︡
︠4ce3b9f7-a068-471c-8480-04c29113ad72︠
go = open('go3','w')
for b in bad:
    print b[0],
    sys.stdout.flush()
    x = set_bup_last_save(b[0])
    s = '\n'.join(x) + '\n'
    go.write(s)
    go.flush()

︡3178d125-71c0-4493-a641-1c9797552194︡{"stdout":"00812e3b-bb2c-4fad-952b-56191e995ff5"}︡{"stdout":" 023c7451-842b-4d39-9666-91dac73d27b0"}︡{"stdout":" 0353b3ef-c2e6-474d-87ee-85cb2b680640"}︡{"stdout":" 03af9448-47f6-4072-a4bf-24618638db9b"}︡{"stdout":" 0a0ab830-fd7c-497a-ab55-ebdcdfc2511f"}︡{"stdout":" 0ba15e2b-0aae-4529-8f38-c14404e09169"}︡{"stdout":" 0c0bdabf-57ef-4ee7-9b25-37ba4fe94670"}︡{"stdout":" 0d42db10-b017-478c-b036-5bb2965d56af"}︡{"stdout":" 0e67d14a-949f-497f-915c-152209211d6d"}︡{"stdout":" 11472f00-b63a-4340-a52d-4cb1737576e3"}︡{"stdout":" 12392b53-985e-4686-92fa-cb454cbc7b44"}︡{"stdout":" 12ff256b-d543-4a3e-80db-61dc4f7ee226"}︡{"stdout":" 13b1bafc-5299-4296-8b43-e84b0eaf2214"}︡{"stdout":" 16b16247-941f-406f-ac2c-48616ddb5980"}︡{"stdout":" 171ecc89-9384-4bde-b17e-548a70cc9916"}︡{"stdout":" 1b7f80b4-ad15-4f1d-925e-2349e4b16d41"}︡{"stdout":" 1cf97339-5927-4df1-9f25-9131c6ff793e"}︡{"stdout":" 1d40d8e3-60a3-416a-acef-7474b5f96522"}︡{"stdout":" 1dc659cb-d481-43c2-8dfa-592a3cff04bb"}︡{"stdout":" 1fa98bc4-ebfa-42f7-a2da-060cdbd940a5"}︡{"stdout":" 20fe99b9-182a-4ad7-8200-f4a9ed73c48b"}︡{"stdout":" 21ad12ee-279d-44e2-a8e4-521583f5c443"}︡{"stdout":" 2784fe54-e97a-4649-b770-6dd69e9ed552"}︡{"stdout":" 28adbdff-8440-41f5-8ceb-9d06dfc616bc"}︡{"stdout":" 294a8c22-e2d3-4724-87c1-112cc3b51add"}︡{"stdout":" 2eea45b2-3450-4add-a42c-40ea3c8880ff"}︡{"stdout":" 307601cf-c8b8-465a-bd83-37a60b5f3a30"}︡{"stdout":" 31682cc3-f978-4b44-88fa-91685a9645ce"}︡{"stdout":" 349b281f-2282-4ab9-bdbb-c18906413638"}︡{"stdout":" 359783a8-da77-4985-9a35-06a6bb5356cd"}︡{"stdout":" 3aa5dec9-6664-4656-b0e1-13f1d1f86f44"}︡{"stdout":" 3db05cca-c235-4241-8b12-197376987502"}︡{"stdout":" 3ffe274c-81c4-4fde-8726-2d2f7caa82e1"}︡{"stdout":" 409a663e-5c3c-4dcb-828e-fdf819c689a4"}︡{"stdout":" 48defaf1-a5a3-4966-b477-9a23c4f25194"}︡{"stdout":" 4a27d601-ea4f-4e7c-a924-9ba7c0bb66f2"}︡{"stdout":" 4b764ace-fc02-4d4f-a52b-3d421f2b3ee0"}︡{"stdout":" 4c26b509-5347-4848-a1cb-1289b11be7a3"}︡{"stdout":" 4eeeadc0-7001-46f6-9622-701b4b2e440f"}︡{"stdout":" 5058e40c-1470-401a-8fec-c2513907616b"}︡{"stdout":" 52c527f9-378a-4ecf-9158-abe34354692f"}︡{"stdout":" 52e3b199-f4e3-4216-8750-2834be8bb000"}︡{"stdout":" 562565fd-ee71-4f70-91c3-f00ff393f8b6"}︡{"stdout":" 57632400-39ee-4b7a-96c5-cebd996bca87"}︡{"stdout":" 5b9e003c-a81d-4b1b-bad3-842a3951d0a4"}︡{"stdout":" 5bf930c7-6aba-47cf-9402-a424f3d0ef96"}︡{"stdout":" 6063a39d-5d28-4005-847a-18ddfa9aafa5"}︡{"stdout":" 606fa8c2-5a6e-4748-ba47-ef31b250d28c"}︡{"stdout":" 613d5d06-5415-4c1a-876d-1aa69de046b0"}︡{"stdout":" 6db37ea7-b942-49c9-9c1b-c5f5393703fe"}︡{"stdout":" 6f34e16b-758c-4812-8d62-11ab64f06444"}︡{"stdout":" 7269ab3f-7742-4913-920a-470d73847a83"}︡{"stdout":" 74af30b7-ad25-4308-a02e-c71fcd84de6e"}︡{"stdout":" 75b2c0dc-9dab-4be0-84b7-c5d87de2a638"}︡{"stdout":" 76263104-d706-40a5-88f0-71449b31ca01"}︡{"stdout":" 78b2c4a1-b0ae-46ce-b461-eae788ddc4e7"}︡{"stdout":" 7cbb06a2-5af1-4b0a-869a-d58fb78595be"}︡{"stdout":" 8118685e-5465-4b05-88b9-2d3c5b28a388"}︡{"stdout":" 821e385c-bc3e-4770-a060-ba284ca450ee"}︡{"stdout":" 83e447da-6d7e-49be-a8f7-8e2a9f6fc6cd"}︡{"stdout":" 84bd3c7f-df63-4af8-8088-e9d7d102045b"}︡{"stdout":" 85b6c89a-28d4-4949-862d-4619d7018f93"}︡{"stdout":" 87070cee-204a-4f05-824b-27983f0c94e7"}︡{"stdout":" 87e7b598-58ee-4f31-a9f1-0e658c9b582d"}︡{"stdout":" 8b8f8cfc-ec1c-47e6-8b65-99ebb458f071"}︡{"stdout":" 8dcc8fad-a597-41b5-9415-e78601fba7e8"}︡{"stdout":" 94a020d0-7282-4166-a261-c66672342609"}︡{"stdout":" 987c3972-4cf7-456c-b5da-63f41b26b093"}︡{"stdout":" 994caffd-ce37-4a30-9fc9-1f0e6efa4811"}︡{"stdout":" 9af4a38a-8bf9-4470-87c6-21dcabf7eb3c"}︡{"stdout":" 9f274e6b-829a-40e3-b7b2-b6046356455f"}︡{"stdout":" 9fe655be-8145-4dcc-a2c8-90815086b4ce"}︡{"stdout":" a00549cd-cb22-4251-97e4-18ac689ae893"}︡{"stdout":" a03601a8-a259-4d45-8f76-1d7c68b7a3f9"}︡{"stdout":" a062f9d5-0610-41ad-bf49-d839656fa02f"}︡{"stdout":" a07b60fb-3f9d-466e-a895-2831c97cd6a3"}︡{"stdout":" a263db77-6850-46f7-b665-72fc0bfdf034"}︡{"stdout":" a8140ed7-e9ce-45e8-baa9-25ac38bed58c"}︡{"stdout":" abdc6f9f-cf83-4b5e-ad1c-0012ae18c1d3"}︡{"stdout":" ad458b3b-c7d7-4450-8a42-86217d7614a7"}︡{"stdout":" ad52c878-56c8-47a2-aa25-6b75166ce8b7"}︡{"stdout":" af0123cf-69ea-41d5-81b0-09c67d591b39"}︡{"stdout":" b5266f3e-0bdd-45c7-80b1-d34d52324833"}︡{"stdout":" b7228065-63e0-4aa7-96ee-fae376cafc54"}︡{"stdout":" b7d80d92-a8a7-441b-b11a-e1328f001bc4"}︡{"stdout":" babde1c7-d89f-4684-a602-926520d77daa"}︡{"stdout":" bc6bf3cd-abff-4d84-aac2-71b6b8478516"}︡{"stdout":" be799d40-7c45-4736-abfb-044b990f1575"}︡{"stdout":" c0270480-4124-4968-80a1-84ac8feb1e76"}︡{"stdout":" c15a649e-9c9e-40d5-a7ab-3741af153f44"}︡{"stdout":" c35473eb-21db-4578-a222-b47af6732d1e"}︡{"stdout":" c3ee3ce8-23c0-495e-a6f2-8f8acbd45123"}︡{"stdout":" c4396f70-15a0-4480-aa0b-4b494d198b53"}︡{"stdout":" c56935a8-8137-4c8a-954d-8cb41e57a053"}︡{"stdout":" c6b42aa2-a189-445d-8bb7-880848c5b633"}︡{"stdout":" c9b58212-8413-42dc-86f3-052665be795a"}︡{"stdout":" ca380435-24c4-4723-a7a0-ff6bcd1cf56f"}︡{"stdout":" cb62565a-2be9-42db-a07b-df44f8003219"}︡{"stdout":" cbfd54bd-50c2-4908-bcac-d65514eda265"}︡{"stdout":" ccbdefa4-8dfa-48eb-a165-4d52a1d8b5e4"}︡{"stdout":" cd3f3be5-52e3-44da-bcc5-16c962f35121"}︡{"stdout":" cdb07a4f-b8c2-4666-ade5-e3ddda5e3b79"}︡{"stdout":" cdec7047-c4c4-46a0-b1e7-ac0b8f73a08f"}︡{"stdout":" d088abab-85a1-4e62-8b9b-876bc72f7769"}︡{"stdout":" d150a8c4-95fb-4f2b-8369-9db92ab98b74"}︡{"stdout":" d38949e7-b07d-4435-ad1d-da4e5d74c9ed"}︡{"stdout":" d692eeba-9619-44bc-9ee3-730699175151"}︡{"stdout":" d6df9d1b-2462-4aa2-91e0-995610ea1726"}︡{"stdout":" d8b5ecad-937d-463f-a9b6-46687d98ad67"}︡{"stdout":" d9b076a7-e8c4-45cb-a446-e5f1d65c1a72"}︡{"stdout":" ddfef74f-3023-4c1b-bacd-51e7984bff3f"}︡{"stdout":" de028f17-6898-4c74-abf4-c68a12c19023"}︡{"stdout":" dfc0f513-61f0-487c-9adb-5f91b59abe66"}︡{"stdout":" e2cec19a-710f-44f9-b8bf-490d3bbf93ba"}︡{"stdout":" e45b7bab-3a7e-4939-a0ec-2081b92505b1"}︡{"stdout":" e7dc5b46-37ba-49e7-ad97-129be4882126"}︡{"stdout":" e8153dbc-2790-4849-85dd-173762f52433"}︡{"stdout":" ece5e083-961f-4f95-b786-7f465b47d0fe"}︡{"stdout":" eec2120e-b58f-498f-b03f-e7e371273378"}︡{"stdout":" ef5e7efb-b908-4b1b-b074-1a0eb85c342b"}︡{"stdout":" f193a027-daa6-4c27-955f-c236f4479c05"}︡{"stdout":" f3541a21-e7a2-48f2-9c4d-84406ba26924"}︡{"stdout":" f39851dc-eb6c-42e3-acc6-8dd98b07a6f3"}︡{"stdout":" f7ea7e8d-5e70-43c3-bcdb-6933df5b1dca"}︡{"stdout":" f7fcc44a-e055-4d21-af3e-d4d5963b4927"}︡{"stdout":" f98c11f8-2928-4b2c-875a-b771e2ef36f4"}︡{"stdout":" fd930c54-e77f-4a5d-adff-0e1a3684bc4b"}︡{"stdout":" fe1499b4-d5e7-4ecb-a61c-8c04128b7a77"}︡{"stdout":" feb6bed8-805f-4733-88cf-a0a462c79826"}︡{"stdout":" ff85b059-0da3-415d-a82d-05cbbcbae553"}︡
︠7820be14-e3f3-4bfb-b941-bf793ff0b696︠
hosts(bad[0][1])
︡ac6d96a9-34a6-4232-96f3-8655a71d9ac5︡{"stdout":"['4e4a8d4e-4efa-4435-8380-54795ef6eb8f', 'f71dab5b-f40c-48db-a3d2-eefe6ec55f01', 'dad2a46d-2a57-401a-bfe2-ac4fc7d50ec1', '2d7f86ce-14a3-41cc-955c-af5211f4a85e']\n"}︡
︠bfd62417-e4be-4f05-9dfd-f8818c69e8da︠
db[bad[0][1]]
︡b285b7b9-457d-42c1-acea-5354b210bb67︡{"stdout":"{'locs': set(['2d7f86ce-14a3-41cc-955c-af5211f4a85e', 'c2ba4efc-8b4d-4447-8b0b-6a512e1cac97', 'a7cc2a28-5e70-44d9-bbc7-1c5afea1fc9e']), 'loc': '2d7f86ce-14a3-41cc-955c-af5211f4a85e'}\n"}︡
︠5b126fb1-2c84-4b3b-bb41-01c171023858︠
id_to_host['c2ba4efc-8b4d-4447-8b0b-6a512e1cac97']
︡5d22913d-de79-4dea-aaeb-8bfcfb5958e6︡{"stdout":"'10.3.1.4'\n"}︡
︠97f4b2fd-84d4-4a34-8d76-857ef667031a︠
bad[0]
︡b6ed13a1-8eaf-498d-a7f6-f06d63b34d9f︡{"stdout":"(4, '2fc41fc1-5417-46f8-8141-7b6826473e37')\n"}︡
︠c09b4db5-3500-4bec-9e46-8ac22536068a︠
p = bad[1][1]
print '\n'.join(look_good(p) + look_bad(p) + copy_from_bad_to_master(p) + look_good(p))
︡c1a39886-b9c3-4889-83a4-c3d7966d61d5︡{"stdout":"ssh 10.1.12.5 'ls /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.1.3.5 'ls /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.1.10.5 'ls /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.3.1.4 'ls /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nset -e\nset -v\nssh 10.1.3.5 'rsync -axH --update --exclude .snapshots /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/ 10.1.12.5:/projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.1.10.5 'rsync -axH --update --exclude .snapshots /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/ 10.1.12.5:/projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.3.1.4 'rsync -axH --update --exclude .snapshots /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/ 10.1.12.5:/projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\nssh 10.1.12.5 'bup_storage.py save --targets=10.1.3.5,10.1.10.5,10.3.1.4 4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1'\nssh 10.1.12.5 'ls /projects/4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1/'\n"}︡
︠e43fd37f-4d52-4431-8f53-88ec19d5ec5f︠
go = open('go2','w')
for b in bad[1:]:
    print b[1]
    x = copy_from_bad_to_master2(b[1])
    s = '\n'.join(x) + '\n'
    go.write(s)
    go.flush()

︡ea80039c-a6e3-45ed-af2d-877ebf664bb4︡{"stdout":"4de9e44d-2fd2-4f90-b7b5-0b7a865b11f1\n69e423dc-046c-471b-ba43-ddb587a0bdea\n6c6f8dde-c0fa-4868-b3b5-82e062b46d81\na662a37c-846d-4e7f-afe8-e37d5007b0de\nab0379f3-8db2-491c-aae4-ae11250115f4\nb81aca65-7707-40b7-96bc-848947caf065\ncda73fa0-ee28-469c-91b2-dac599726ff5\nd0a4a097-5254-4eca-8a31-611ba277e70b\ne1198abb-65ac-45bc-84f5-7e41c01c44bb\ne8000e54-2cdf-4f6d-8cdb-b3b5af10bb73\nff8cad0f-4a01-45e7-8de5-493eb2ec50fc\nfffa6d3e-2d36-4a17-b4c5-084abbb9e3e9\n15dbd3ea-135c-4b20-b3f3-2df210c7e8c7\n4b29426a-2fd3-40cd-ba3d-c4380c8a8206\n4d8e463f-66e9-44b6-b9af-15207098d2c6\n543f7fc0-6ec8-4a04-a18a-afaf80306269\n758d7fb1-3fb0-44e2-8adc-6fa3e7596427\n992ce320-e0db-488a-86f8-1a47d3046c42\na1d662c5-25f1-4195-9464-d51a226367ea\na1ed29c4-5f5b-4dc4-8bd4-c7d0317126a7\nd3f6a49a-cc16-41e7-9be1-bd377d29caed\n0126d700-76b2-4f80-8547-5d0a24ddf508\n2c42babe-7d6b-47b9-96dd-4265bfd5985c\n41b04c90-fd0c-4430-b35e-09810bc0d49f\n476f08ef-9524-47b9-bfb7-d64a08872eb3\n6b7c4892-872e-4960-a585-196b86011fae\n900ea07e-7897-4f77-b68c-bb0b548d5d9d\na12eb284-461e-4016-88ce-13caebdd7483\naa86b693-834b-4d44-9c24-fbef8ca2c083\nb24ae50e-fd5a-44bc-8403-c2bb39dd8cdd\nba7347e2-7c9e-4458-beee-bb03deb978db\nbe0bcedf-241b-4018-ad61-50a9d98495ff\nc2d67f06-ec69-4c29-ae21-c4e28a2abec0\nc417d9a3-2618-40dc-8047-3e7c989d510c\ncc8df2d6-ba9b-4913-93f7-a00870d61932\nd33a74ad-97d3-449c-8117-3fad1ea9c325\ne735cbdf-891d-4dbc-9fcc-34d5dc5dc46d\n6d637400-91a9-46c4-8090-a69d8745fb26\n"}︡
︠ee9e2388-1819-45ac-a577-0f57c473bf41︠
go.flush()
︡36de885f-d6f1-4c20-93ce-452e7ccaa066︡
︠b3fc4089-c4bb-4820-b258-1e7eb9180966︠
copy_from_bad_to_master('69e423dc-046c-471b-ba43-ddb587a0bdea')
︡81096ae3-675c-4d91-99cf-d1fae65ae6e7︡{"stdout":"['set -e', 'set -v', \"ssh 10.1.5.5 'rsync -axH --update --exclude .snapshots /projects/69e423dc-046c-471b-ba43-ddb587a0bdea/ 10.3.3.4:/projects/69e423dc-046c-471b-ba43-ddb587a0bdea/'\", \"ssh 10.3.7.4 'rsync -axH --update --exclude .snapshots /projects/69e423dc-046c-471b-ba43-ddb587a0bdea/ 10.3.3.4:/projects/69e423dc-046c-471b-ba43-ddb587a0bdea/'\", \"ssh 10.1.11.5 'rsync -axH --update --exclude .snapshots /projects/69e423dc-046c-471b-ba43-ddb587a0bdea/ 10.3.3.4:/projects/69e423dc-046c-471b-ba43-ddb587a0bdea/'\", \"ssh 10.3.3.4 'bup_storage.py save --targets=10.1.5.5,10.3.7.4,10.1.11.5 69e423dc-046c-471b-ba43-ddb587a0bdea'\"]\n"}︡
︠05b4b9a3-388b-4426-840b-ee7daabb225f︠
bad[-1]
︡98075b24-764e-4f65-86f2-05859715eac0︡{"stdout":"(11, 'a24fb490-ff86-46d6-a98b-b44bae9386ef')\n"}︡
︠603995eb-4648-4f6e-a511-4c2dc1859ec3︠

︠32c6f6d8-bdcc-46d6-be2a-a1cbe07e4dfe︠

︠dc216f94-d8f3-4c76-8ee7-13531bd03279︠
for n, p in bad:

︠06259abb-83ca-4d88-b664-3958a8aaf2c8︠
bad0 = list(bad)
︡8ee30994-53ee-488d-9995-d5bbc95d4d56︡
︠f1d17d00-edc6-4b94-b8bb-1e6235fc8a55︠
a='3702601d-9fbc-4e4e-b7ab-c10a79e34d3b'
︡a159cc5e-ced8-4863-860a-6013ee3c2740︡
︠85813247-36c0-4982-b2f5-0854847a5d43︠
len([a for x in v if a in x])
︡366d723d-accc-4c39-b544-c8f72f6d74b4︡{"stdout":"3\n"}︡
︠f2b212d8-b151-4998-ae10-1c3b8c7ecaf8︠
a in w
︡d14337f4-e60a-4ac6-b6bc-0a518bb42d54︡{"stdout":"True\n"}︡
︠febf6641-73dc-4a96-98c4-743ba03a5a34︠
w[0]
︡8bbb13f3-e621-407a-9689-26a38f99fd0a︡{"stdout":"'a0f92c48-a0bc-48ee-9a8d-fe20b7336411'\n"}︡
︠130baf2a-305f-46b0-8f7a-c4adcd27f2cd︠









