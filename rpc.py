import json,os,requests,sys
s=json.load(open(os.path.expanduser("~/.cache/lovable-auth/session.json")))
from run import A,U
H={"apikey":A,"Authorization":"Bearer "+s["session"]["access_token"],"Content-Type":"application/json"}
def rpc(n,b={}): r=requests.post(U+"/rest/v1/rpc/"+n,json=b,headers=H); return r.status_code, r.json()
c1,ov=rpc("seo_city_generation_overview"); c2,cc=rpc("seo_control_center")
print(c1,c2, type(ov), list(cc.keys()) if isinstance(cc,dict) else cc)
gs={c["slug"] for c in ov["cities"]}; cs={c["slug"]:c for c in cc["cities"]}
miss=[k for k in cs if k not in gs]; print("control",len(cs),"gen",len(gs),"absentes du générateur",len(miss), miss[:40])
print("beaumont gen:", [c for c in ov["cities"] if c["slug"]=="beaumont"]); print("beaumont ctl:", cs.get("beaumont"))
print("totals", cc.get("totals"))
