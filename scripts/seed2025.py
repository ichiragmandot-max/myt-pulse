# Builds db/seed_2025_*.sql (chunked multi-row inserts) from cleaned 2025 records
import json,sys,os,glob
d=json.load(open(sys.argv[1])); sys.path.insert(0,sys.argv[2]); from names import SUBJ
outdir=sys.argv[3]
for f in glob.glob(os.path.join(outdir,'seed_2025*.sql')): os.remove(f)
q=lambda v:'NULL' if v is None else ("'"+str(v).replace("'","''")+"'" if isinstance(v,str) else repr(v))
subs=[f"({o['rid']+1000000},2025,{q(o['ts'][:19])},{q(o['centre'])},{q(o['batch'])},{q(o['q1'])},{q(o['q2'])},{q(o['q3'])},{q(o['comment'])})" for o in d['overall']]
rats=[]
for role in ('teacher','staff'):
    for t in d[role]:
        subj=SUBJ.get(t.get('subject'),t.get('subject'))
        rats.append(f"({t['rid']+1000000},2025,{q(t['centre'])},{q(t['batch'])},'{role}',{q(t['name'])},{q(subj)},{','.join(q(x) for x in t['r'])},{q(t['comment'])})")
stmts=['DELETE FROM ratings WHERE year=2025;','DELETE FROM submissions WHERE year=2025;']
def chunks(rows,head,size=100):
    for i in range(0,len(rows),size): stmts.append(head+',\n'.join(rows[i:i+size])+';')
chunks(subs,'INSERT INTO submissions(id,year,ts,centre,batch,q1,q2,q3,comment) VALUES\n')
chunks(rats,'INSERT INTO ratings(sid,year,centre,batch,role,person,subjects,r1,r2,r3,r4,r5,comment) VALUES\n')
part,size,n=[],0,1
for s in stmts:
    part.append(s); size+=len(s)
    if size>700000:
        open(os.path.join(outdir,f'seed_2025_{n}.sql'),'w').write('\n'.join(part)+'\n'); part,size,n=[],0,n+1
if part: open(os.path.join(outdir,f'seed_2025_{n}.sql'),'w').write('\n'.join(part)+'\n')
print(len(subs),len(rats),n,'files')
