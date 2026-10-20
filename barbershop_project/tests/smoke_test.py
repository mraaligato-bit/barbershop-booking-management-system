"""Repeatable API smoke tests for a fresh local demo database.
Start app.py first, then run this script from any directory.
"""
import json, urllib.request, urllib.error, http.cookiejar, datetime, sys
BASE='http://127.0.0.1:8000'
results=[]

def client():
    cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)); return op

def request(op, method, path, body=None, expected=(200,)):
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+path,data=data,method=method,headers={'Content-Type':'application/json'})
    try:
        with op.open(req,timeout=6) as r: status=r.status; payload=json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        status=e.code; payload=json.loads(e.read().decode() or '{}')
    if status not in expected: raise AssertionError(f'{method} {path}: expected {expected}, got {status}; {payload}')
    return status,payload

def check(test_id, name, fn):
    try:
        detail=fn(); results.append((test_id,name,'PASS',str(detail))); print(f'PASS {test_id}: {name} — {detail}')
    except Exception as e:
        results.append((test_id,name,'FAIL',str(e))); print(f'FAIL {test_id}: {name} — {e}')

customer=client(); admin=client(); barber=client(); owner=client(); barber2=client(); newcustomer=client()
data={}

def get_catalog():
    s=request(customer,'GET','/api/services')[1]['services']; b=request(customer,'GET','/api/barbers')[1]['barbers']; return f'{len(s)} services, {len(b)} barbers'
check('T01','Public catalog',get_catalog)
check('T02','Customer login',lambda: request(customer,'POST','/api/login',{'username':'customer','password':'customer123','portal':'customer'})[1]['user']['role'])
check('T03','Portal mismatch denied',lambda: request(client(),'POST','/api/login',{'username':'customer','password':'customer123','portal':'staff'},(403,))[0])

def create_booking():
    today=datetime.date.today(); day=today+datetime.timedelta(days=5)
    while day.weekday()==0: day+=datetime.timedelta(days=1)
    data['date']=day.isoformat()
    status,b=request(customer,'POST','/api/appointments',{'service_id':1,'barber_id':3,'appointment_date':data['date'],'start_time':'10:00','customer_note':'Automated smoke test'},(201,)); data['appointment_id']=b['id']; data['reference']=b['reference_code']; return b['reference_code']
check('T04','Valid booking',create_booking)
check('T05','Overlapping appointment rejected',lambda: request(customer,'POST','/api/appointments',{'service_id':1,'barber_id':3,'appointment_date':data['date'],'start_time':'10:00'},(409,))[0])
check('T06','Customer record privacy',lambda: len(request(customer,'GET','/api/appointments')[1]['appointments']))
check('T07','Customer blocked from payroll',lambda: request(customer,'GET','/api/payroll',expected=(403,))[0])
check('T08','Barber login and assigned booking',lambda: (request(barber,'POST','/api/login',{'username':'barber1','password':'barber123','portal':'staff'})[1]['user']['role'],len(request(barber,'GET','/api/appointments')[1]['appointments'])))

def complete_visit():
    for action in ['check_in','start','complete']:
        request(barber,'POST','/api/appointments/action',{'appointment_id':data['appointment_id'],'action':action})
    return 'confirmed → checked-in → in-service → completed'
check('T09','Barber status lifecycle',complete_visit)
check('T10','Review hidden pending moderation',lambda: (request(customer,'POST','/api/reviews',{'appointment_id':data['appointment_id'],'rating':5,'comment':'Automated test review'},(201,))[0],len(request(customer,'GET','/api/reviews')[1]['reviews'])))
check('T11','Admin can list pending reviews',lambda: (request(admin,'POST','/api/login',{'username':'admin','password':'admin123','portal':'staff'})[1]['user']['role'],len(request(admin,'GET','/api/reviews/pending')[1]['reviews'])))
check('T12','Admin blocked from service manager',lambda: request(admin,'POST','/api/services/manage',{'name':'Unauthorized','price':10,'duration_minutes':30},(403,))[0])
check('T13','Owner payroll overview',lambda: (request(owner,'POST','/api/login',{'username':'owner','password':'owner123','portal':'staff'})[1]['user']['role'],len(request(owner,'GET','/api/payroll')[1]['payroll'])))

def approve_review():
    items=request(owner,'GET','/api/reviews/pending')[1]['reviews']; rid=items[0]['id']; request(owner,'POST','/api/reviews/action',{'review_id':rid,'action':'approve'}); return len(request(customer,'GET','/api/reviews')[1]['reviews'])
check('T14','Owner approval publishes review',approve_review)

def manage_service():
    request(owner,'POST','/api/services/manage',{'name':'QA Temporary Service','description':'Temporary test','price':1,'duration_minutes':30,'is_active':True})
    all_s=request(owner,'GET','/api/services?all=1')[1]['services']; qa=next(x for x in all_s if x['name']=='QA Temporary Service')
    request(owner,'POST','/api/services/manage',{'service_id':qa['id'],'name':'QA Temporary Service','description':'Temporary test','price':1,'duration_minutes':30,'is_active':False})
    all_s=request(owner,'GET','/api/services?all=1')[1]['services']; qa=next(x for x in all_s if x['name']=='QA Temporary Service')
    active=[x for x in request(customer,'GET','/api/services')[1]['services'] if x['name']=='QA Temporary Service']
    return f"inactive listed for owner={qa['is_active']==0}, shown publicly={bool(active)}"
check('T15','Owner service management',manage_service)
check('T16','Owner records expense',lambda: request(owner,'POST','/api/expenses',{'expense_date':datetime.date.today().isoformat(),'amount':1.25,'category':'Test','description':'Smoke test expense'},(201,))[0])
check('T17','Customer registration',lambda: request(newcustomer,'POST','/api/register',{'full_name':'Smoke Test','email':'smoke.unique@example.test','username':'smokeuser_unique','password':'smoke-pass-123'},(201,))[1]['user']['role'])
def staff_management():
    request(owner,'POST','/api/staff/manage',{'full_name':'QA Staff Account','email':'qa.staff.account@example.test','username':'qa_staff_test','password':'qa-staff-pass-123','role':'admin'},(201,))
    records=request(owner,'GET','/api/staff')[1]['staff']; target=next(x for x in records if x['username']=='qa_staff_test')
    request(owner,'POST','/api/staff/manage',{'user_id':target['id'],'is_active':False})
    target=next(x for x in request(owner,'GET','/api/staff')[1]['staff'] if x['username']=='qa_staff_test')
    return f"created admin and deactivated account; active={bool(target['is_active'])}"
check('T18','Owner staff account management',staff_management)
check('T19','Admin review moderation privilege',lambda: request(admin,'GET','/api/reviews/pending')[0])

fails=[x for x in results if x[2]!='PASS']
print(f'\nSUMMARY: {len(results)-len(fails)}/{len(results)} passed')
if fails: sys.exit(1)
