︠2fb58d82-2770-41e6-90d1-73469686ab2casi︠
%auto
%hide
print "click for code"
def task_estimate(tag='today', file='smc.tasks'):
    tm = 0
    OPENING = '"desc":"('
    for x in os.popen('%s | grep -v done\\":1'%('grep %s %s '%(tag, file) if tag else 'cat %s'%file)).readlines():
        i = x.find(OPENING)
        if i == -1:
            continue
        i += len(OPENING)
        j = x.find('?)')
        s = x[i:j]
        print x[:100]
        k = s.split(":")
        h = int(k[0])
        if len(k)>1:
            try:
                m = int(k[1])
            except:
                print x
                raise
        else:
            m = 0
        tm += 60*h + m

    print "-"*70
    print "Total: (%s:%s)"%(tm//60,tm%60)

    for k in [4,8,9,12,16]:
        print "- %5.1f days at %2s hours/day"%(tm/60./k, k)

︡bb745fd8-d2e9-44f5-a7e7-4a83092317a8︡{"auto":true}︡{"stdout":"click for code\n"}︡
︠853e9733-f142-410d-bcdc-395dc94e5e3a︠
@interact
def f(update=['Update'], tag='today'):
   task_estimate(tag=tag)
︡5a22cefa-2880-43d0-ab78-a4bc1516b97c︡{"interact":{"style":"None","flicker":false,"layout":[[["update",12,null]],[["tag",12,null]],[["",12,null]]],"id":"5b8ac3a0-d592-4a12-8f01-aed50fbb5be4","controls":[{"buttons":true,"control_type":"selector","ncols":null,"button_classes":null,"default":0,"lbls":["Update"],"label":"update","nrows":null,"width":null,"var":"update"},{"control_type":"input-box","default":"today","label":"tag","nrows":1,"width":null,"readonly":false,"submit_button":null,"var":"tag","type":"<type 'str'>"}]}}︡
︠4061ad2d-2122-42cf-89db-fe6122a59a67︠









