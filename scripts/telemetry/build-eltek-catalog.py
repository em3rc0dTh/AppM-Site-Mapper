"""Extract numeric OIDs/types/enums from supplied Eltek MIBs; never infer units/scales.
Usage: python scripts/telemetry/build-eltek-catalog.py MIB_DIRECTORY OUTPUT_JSON
"""
import hashlib,json,pathlib,re,sys
root,out=map(pathlib.Path,sys.argv[1:])
modules=[]
for file in sorted(root.glob('*.mib')):
    raw=file.read_bytes(); text=raw.decode('utf-8-sig')
    text=re.sub(r'--[^\n]*','',text)
    nodes={'enterprises':'1.3.6.1.4.1','eltek':'1.3.6.1.4.1.12148'}
    definitions=[]
    pattern=r'(?m)^([\w-]+)[ \t]+(OBJECT IDENTIFIER|OBJECT-TYPE|NOTIFICATION-TYPE|MODULE-IDENTITY|NOTIFICATION-GROUP)\b(.*?)::=\s*\{\s*([\w-]+)\s+(\d+)\s*\}'
    rows=re.findall(pattern,text,re.S)
    pending=list(rows)
    while pending:
        remaining=[]
        for name,kind,body,parent,index in pending:
            if parent not in nodes: remaining.append((name,kind,body,parent,index));continue
            nodes[name]=nodes[parent]+'.'+index
        if len(remaining)==len(pending):raise ValueError('Unresolved MIB symbols: '+str([r[0] for r in remaining]))
        pending=remaining
    for name,kind,body,parent,index in rows:
        if kind not in ('OBJECT-TYPE','NOTIFICATION-TYPE'):continue
        syntax=re.search(r'SYNTAX\s+(.+?)(?:MAX-ACCESS|ACCESS|STATUS)',body,re.S)
        objects=re.search(r'OBJECTS\s*\{(.*?)\}',body,re.S)
        item={'name':name,'oid':nodes[name],'kind':kind}
        if syntax:
            item['syntax']=' '.join(syntax[1].split())
            enums=re.findall(r'([\w-]+)\s*\((-?\d+)\)',syntax[1])
            if enums:item['enums']={n:int(v) for n,v in enums}
        if objects:item['objects']=[s.strip() for s in objects[1].split(',')]
        definitions.append(item)
    modules.append({'file':file.name,'sha256':hashlib.sha256(raw).hexdigest(),'definitions':definitions})
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({'revision':54,'modules':modules},indent=2)+'\n')
for m in modules:print(m['file'],{k:sum(d['kind']==k for d in m['definitions']) for k in ('OBJECT-TYPE','NOTIFICATION-TYPE')})
