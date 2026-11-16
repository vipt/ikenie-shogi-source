"""Fine-tune Hao's three dense NNUE layers with frozen HalfKP features.
Quantization-aware forward pass; checkpoint selected only on validation games.
Original network is never overwritten. NumPy 2.3.5, CPU threads limited to 2.
"""
import os
os.environ["OPENBLAS_NUM_THREADS"]="2"
os.environ["OMP_NUM_THREADS"]="2"
import json, struct, hashlib, time
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/".tools/training/recovery-v1"
BASE=ROOT/".tools/engines/hao/eval/nn.bin"
OUT=ROOT/"artifacts/engines/recovery-v1"
DENSE_SIZE=17700
DENOM=10800.0 # FV_SCALE=20, PawnValue=90, sigmoid scale=600 cp

def read_layers(blob):
    version,net_hash,n=struct.unpack_from("<III",blob)
    arch=blob[12:12+n].decode()
    if "HalfKP(Friend)[125388->256x2]" not in arch or "AffineTransform[32<-512]" not in arch:
        raise ValueError("Unsupported NNUE architecture")
    offset=len(blob)-DENSE_SIZE
    expected=12+n+4+512+125388*256*2+4
    assert offset==expected
    result=[]
    for ni,no in [(512,32),(32,32),(32,1)]:
        b=np.frombuffer(blob,dtype="<i4",count=no,offset=offset).astype(np.float32);offset+=4*no
        w=np.frombuffer(blob,dtype="i1",count=ni*no,offset=offset).reshape(no,ni).astype(np.float32);offset+=ni*no
        result.extend([w,b])
    assert offset==len(blob)
    return result

def integer_raw(x, raw_params):
    for i in range(3):
        x=x@raw_params[2*i].T+raw_params[2*i+1]
        if i<2:x=np.clip(np.floor(x/64),0,127)
    return x[:,0]

SCALES=[64.,8128.,64.,8128.,DENOM/127,DENOM]
def quantize(theta):
    values=[]
    for i,(t,s) in enumerate(zip(theta,SCALES)):
        q=np.rint(t*s)
        q=np.clip(q,-128,127) if i%2==0 else np.clip(q,-2**30,2**30)
        values.append(q.astype(np.float32))
    return values

def forward(x, theta):
    raw=quantize(theta)
    q=[p/s for p,s in zip(raw,SCALES)]
    a=x/127
    t1=a@q[0].T+q[1];h1=np.clip(np.floor(t1*127+1e-5),0,127)/127
    t2=h1@q[2].T+q[3];h2=np.clip(np.floor(t2*127+1e-5),0,127)/127
    # Use exact integer-scaled arithmetic for forward values, with STE derivatives.
    z=integer_raw(x,raw)/DENOM
    return z,(a,t1,h1,t2,h2,q)

def sigmoid(x):return 1/(1+np.exp(-np.clip(x,-20,20)))
def metrics(x,target,theta):
    z,_=forward(x,theta)
    loss=np.mean(np.logaddexp(0,z)-target*z)
    return {"crossEntropy":float(loss),"probabilityRMSE":float(np.sqrt(np.mean((sigmoid(z)-target)**2)))}

def load_data():
    groups={"train":[],"validation":[],"test":[]}; games={k:set() for k in groups}
    total=0; counts={};recov=0
    for f in sorted((DATA/"games").glob("*.json")):
        g=json.loads(f.read_text());total+=len(g["samples"]);recov+=g["recoveries"]
        key="test" if g["id"]%10==9 else "validation" if g["id"]%10==8 else "train"
        games[key].add(g["id"]);groups[key].extend(g["samples"])
    # Held-out splits have priority; never train on their duplicate positions.
    seen=set(); duplicates=0
    for key in ["test","validation","train"]:
        clean=[]
        for d in groups[key]:
            state=" ".join(d["sfen"].split()[:3])
            if state in seen:duplicates+=1;continue
            seen.add(state);clean.append(d)
        groups[key]=clean;counts[key]=len(clean)
    datasets={}
    for key,ds in groups.items():
        x=np.asarray([d["features"] for d in ds],dtype=np.float32)
        raw=np.asarray([d["raw"] for d in ds],dtype=np.float32)
        cp=np.asarray([d["score"] for d in ds],dtype=np.float32)
        target=sigmoid(cp/600.)
        known=np.asarray([d["outcome"] is not None for d in ds])
        outcome=np.asarray([(d["outcome"] or 0)*.5+.5 for d in ds],dtype=np.float32)
        target=np.where(known,.9*target+.1*outcome,target)
        datasets[key]=(x,target,raw)
    summary={"games":{k:len(v) for k,v in games.items()},"generatedSamples":total,
        "uniqueSamples":counts,"duplicatesRemoved":duplicates,"selfCapturesInGeneration":recov,
        "split":"game id modulo 10: 8 validation, 9 test; duplicate SFENs removed across all splits",
        "target":"90% sigmoid(search_cp/600) + 10% game outcome; ply-limit games use teacher only"}
    (DATA/"split-manifest.json").write_text(json.dumps({"summary":summary,"gameIds":{k:sorted(v) for k,v in games.items()}},indent=2))
    return datasets,summary,groups

def train():
    began=time.time()
    if not (DATA/"generation-manifest.json").exists():raise RuntimeError("Finish generation first")
    blob=BASE.read_bytes();raw=read_layers(blob);theta=[p/s for p,s in zip(raw,SCALES)]
    base=[p.copy() for p in theta]
    sets,summary,records=load_data()
    for key,(x,y,observed) in sets.items():
        calc=integer_raw(x,raw)
        if not np.array_equal(calc,observed):
            raise AssertionError(f"Native/Python NNUE mismatch: {key}, max={np.max(np.abs(calc-observed))}")
    initial={k:metrics(x,y,base) for k,(x,y,_) in sets.items()}
    print("dataset",summary,flush=True);print("baseline",initial,flush=True)
    x,y,_=sets["train"];vx,vy,_=sets["validation"]
    if len(x)<1000 or len(vx)<100:raise RuntimeError("Insufficient independent data")
    rng=np.random.default_rng(20261114)
    m=[np.zeros_like(p) for p in theta];v=[np.zeros_like(p) for p in theta]
    best=None;best_loss=float("inf");best_epoch=0;history=[];step=0
    batch=256;epochs=20
    # Bound drift from the original model in quantized units.
    max_raw=[2.,128.,2.,128.,8.,7200.]
    for epoch in range(1,epochs+1):
        order=rng.permutation(len(x))
        lr=.0002*(.3+.7*(1-(epoch-1)/epochs))
        for start in range(0,len(x),batch):
            idx=order[start:start+batch];xb=x[idx];yb=y[idx]
            z,(a,t1,h1,t2,h2,q)=forward(xb,theta)
            dz=((sigmoid(z)-yb)/len(idx))[:,None]
            gw3=dz.T@h2;gb3=dz.sum(axis=0)
            dt2=(dz@q[4])*((t2>0)&(t2<1))
            gw2=dt2.T@h1;gb2=dt2.sum(axis=0)
            dt1=(dt2@q[2])*((t1>0)&(t1<1))
            grads=[dt1.T@a,dt1.sum(axis=0),gw2,gb2,gw3,gb3]
            step+=1
            for i,g in enumerate(grads):
                np.clip(g,-1,1,out=g)
                m[i]=.9*m[i]+.1*g;v[i]=.999*v[i]+.001*g*g
                theta[i]-=lr*(m[i]/(1-.9**step))/(np.sqrt(v[i]/(1-.999**step))+1e-8)
                np.clip(theta[i],base[i]-max_raw[i]/SCALES[i],base[i]+max_raw[i]/SCALES[i],out=theta[i])
        val=metrics(vx,vy,theta)
        history.append({"epoch":epoch,"lr":lr,**val})
        print("epoch",epoch,val,flush=True)
        if val["crossEntropy"]<best_loss:
            best_loss=val["crossEntropy"];best_epoch=epoch;best=[p.copy() for p in theta]
    assert best is not None
    updated=quantize(best)
    packed=bytearray(blob[:len(blob)-DENSE_SIZE])
    for w,b in zip(updated[::2],updated[1::2]):
        packed.extend(b.astype("<i4").tobytes());packed.extend(w.astype("i1").tobytes())
    assert len(packed)==len(blob) and packed[:len(blob)-DENSE_SIZE]==blob[:len(blob)-DENSE_SIZE]
    changed=int(sum(np.count_nonzero(a!=b) for a,b in zip(raw,updated)))
    assert changed>0, "No parameters changed"
    (OUT/"eval").mkdir(parents=True,exist_ok=True)
    (OUT/"eval/nn.bin").write_bytes(packed)
    final={k:metrics(x,y,best) for k,(x,y,_) in sets.items()}
    sha=hashlib.sha256(packed).hexdigest()
    result={"createdAt":time.strftime("%Y-%m-%dT%H:%M:%S%z"),"dataset":summary,
        "baseSha256":hashlib.sha256(blob).hexdigest(),"sha256":sha,"evalFile":str((OUT/"eval/nn.bin").relative_to(ROOT)).replace("\\","/"),
        "architecture":"HalfKP256; feature transformer frozen; all three dense layers fine-tuned",
        "trainedParameterCount":sum(p.size for p in raw),"changedQuantizedParameters":changed,
        "optimizer":"Adam with quantization-aware forward, straight-through derivative, bounded drift",
        "epochs":epochs,"selectedEpoch":best_epoch,"selection":"validation games only; test evaluated after selection",
        "batchSize":batch,"seed":20261114,"baseline":initial,"trained":final,"history":history,
        "nativeParitySamples":sum(len(v[0]) for v in sets.values()),"elapsedSeconds":time.time()-began,
        "status":"experimental; playing strength not yet established"}
    (OUT/"training-manifest.json").write_text(json.dumps(result,indent=2))
    (ROOT/"reports/recovery-training.json").write_text(json.dumps(result,indent=2))
    # Small independent native reload audit, all held-out and not used in training.
    audits=[]
    for d in records["test"][:32]:
        row={k:d[k] for k in ["sfen","game","ply"]}
        row["expectedRaw"]=int(integer_raw(np.asarray([d["features"]],dtype=np.float32),updated)[0])
        audits.append(row)
    (DATA/"reload-audit.json").write_text(json.dumps(audits))
    print("saved",sha,"changed",changed,"selected epoch",best_epoch,flush=True)
    print("final",final,flush=True)
if __name__=="__main__":train()

