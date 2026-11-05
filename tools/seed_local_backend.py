"""로컬 백엔드에 콘솔 확인용 예시 이벤트를 넣는다.

    python tools/seed_local_backend.py [http://localhost:8000]

배포 서버(공유 DB)에 쓰지 않도록 localhost·127.0.0.1 주소만 받는다.
"""
import json, random, hashlib, sys, urllib.parse, urllib.request
BASE=(sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8000').rstrip('/')
if urllib.parse.urlparse(BASE).hostname not in ('localhost','127.0.0.1'):
    sys.exit('로컬 백엔드 주소만 쓸 수 있어요: '+BASE)
random.seed(7)
URL=BASE+'/logs/events'
S=['NAME','PHONE','EMAIL','ADDRESS','ID_NUMBER','ACCOUNT','CARD','DOB']
def post(ev):
    req=urllib.request.Request(URL,data=json.dumps(ev).encode(),headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(req))
n=0
for i in range(140):
    r=random.random()
    if r<.14: grade,types='public_O',[]
    elif r<.36: grade,types='confidential_C',random.sample(['API_KEY','PASSWORD','ACCESS_TOKEN'],1)
    else: grade,types='sensitive_S',random.sample(S,random.choice([1,2,3]))
    if grade=='public_O': action,reason='send_as_is',None
    elif grade=='confidential_C': action,reason='cancel',None
    else:
        x=random.random()
        if x<.62: action,reason='send_transformed',None
        elif x<.70: action,reason='cancel',None
        elif x<.80: action,reason='revert_original','false_positive'
        elif x<.92: action,reason='revert_original','business_need'
        else: action,reason='send_as_is',None   # 원문 그대로 보냄, 사유 없음
    ev={'request_id':f'w-{i:04d}','grade':grade,'action':action,'reason':reason,
        'detection_confidence':'high' if random.random()<.85 else 'low',
        'detected_types':types,'detected_count':len(types)+random.randint(0,2) if types else 0,
        'reverted':action=='revert_original','restored':action=='send_transformed' and random.random()<.7,
        'content_hash':hashlib.sha256(f'seed-{i}'.encode()).hexdigest()}
    post(ev); n+=1
print('seeded',n)
print(urllib.request.urlopen(BASE+'/logs/stats').read().decode())
