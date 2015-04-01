︠8a2a7ae8-f836-496e-a08c-28e1f6d24668s︠
for i, addr in enumerate('23.236.49.76 130.211.167.63 162.222.176.40 162.222.182.154 104.154.56.232 199.223.234.31 23.236.53.228 162.222.183.50'.split()):
    print "mkdir -p compute1dc2/projects && rsync -axH root@%s:/projects/ compute%sdc2/projects/"%(addr, i+1)
︡637d7617-86e5-446f-84e0-c5be369cb129︡{"stdout":"mkdir -p compute1dc2/projects && rsync -axH root@23.236.49.76:/projects/ compute1dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@130.211.167.63:/projects/ compute2dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@162.222.176.40:/projects/ compute3dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@162.222.182.154:/projects/ compute4dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@104.154.56.232:/projects/ compute5dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@199.223.234.31:/projects/ compute6dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@23.236.53.228:/projects/ compute7dc2/projects/\nmkdir -p compute1dc2/projects && rsync -axH root@162.222.183.50:/projects/ compute8dc2/projects/\n"}︡
︠4315656a-97c8-44f7-9f49-123b06a8f0a9︠










