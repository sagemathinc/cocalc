︠c15b3cac-ccb8-4edd-addf-82e9260affc9︠
︡d12eb04a-4e2a-46fb-8bc1-a6cf05b8d5a9︡
︠ebe337e6-c94a-45cf-8dea-e1552a7d8afd︠
s = open('july2013-push.md').read()
tm = 0
sec = 0
done = 0
for task in s.splitlines():
    if len(task) == 0:
        continue
    if task[:2] == "# ":
       if sec > 0:
            print "%3s    (%3s done)"%(round(sec), round(done))
            done = 0
            sec = 0
       print "%20s:"%task[1:].strip(),
    if '?)' in task:
        i = task.find('(')
        j = task.find(')')
        if i != -1:
            est = task[i+1:j-1]
            k = est.split(':')
            if len(k) == 2:
                h = int(k[0]); m = int(k[1])
                t = h + m/60.0
                if '[x]' not in task:
                    tm += t
                    sec += t
                else:
                    done += t

print "%3s    (%3s done)"%(round(sec), round(done))
print "-"*30
print "%20s: %3s"%("Total", round(tm))
︡787e3658-b8e5-41a5-8d8f-2b9f843b7f62︡{"stdout":"   Top priority bugs:   4    (0.0 done)\n     Growth features:   4    (0.0 done)\n   User Visible Bugs:  47    (  2 done)\n       User Features:  33    (0.0 done)\n  Major new features:   9    (0.0 done)\n         Server Bugs:  12    (0.0 done)\n     Server Features:   5    (0.0 done)\n          Operations:"}︡{"stdout":"   7    (0.0 done)\n"}︡{"stdout":"------------------------------\n"}︡{"stdout":"               Total: 121\n"}︡
︠49578708-54db-404e-98b3-479b1dde27be︠
md(s,hide=0)
︠02960183-cd12-4932-b690-3cf24ec8c593︠









