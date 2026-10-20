#!/usr/bin/env python3
"""Local educational prototype for a Barbershop Booking Management System.
Run with: python app.py (Python 3.10+, standard library only).
This is a classroom demo, not a production-deployed service.
"""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import sqlite3, json, secrets, hashlib, hmac, datetime, re, threading, os

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
DB_PATH = ROOT / "barbershop.db"
SCHEMA_PATH = PROJECT_ROOT / "database_schema.sql"
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8000"))
SESSIONS = {}
SESSION_LOCK = threading.Lock()

SERVICES = [
    ("Classic Haircut", "Clean, timeless haircut finished with a quick style.", 25000, 30),
    ("Skin Fade", "Detailed fade with a sharp, blended finish.", 35000, 45),
    ("Haircut + Beard Trim", "A haircut paired with a tidy beard shape-up.", 45000, 60),
    ("Beard Trim", "Beard shaping and clean edge detailing.", 18000, 20),
    ("Hair Wash + Style", "Wash, dry, and style for a fresh finish.", 20000, 25),
]
DEMO_USERS = [
    ("customer", "customer123", "Jamie Santos", "customer@example.test", "customer"),
    ("admin", "admin123", "Alex Rivera", "admin@example.test", "admin"),
    ("barber1", "barber123", "Marco Reyes", "marco@example.test", "barber"),
    ("barber2", "barber123", "Paolo Cruz", "paolo@example.test", "barber"),
    ("owner", "owner123", "Sam Dela Cruz", "owner@example.test", "owner"),
]


def pw_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 180_000)
    return salt.hex() + ":" + derived.hex()


def pw_ok(password: str, packed: str) -> bool:
    try:
        salt_hex, digest_hex = packed.split(":", 1)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 180_000)
        return hmac.compare_digest(derived.hex(), digest_hex)
    except Exception:
        return False


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed_db():
    with connect() as db:
        db.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        for username, password, full_name, email, role in DEMO_USERS:
            existing = db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
            if not existing:
                db.execute("INSERT INTO users(username,password_hash,full_name,email,role) VALUES(?,?,?,?,?)",
                            (username, pw_hash(password), full_name, email, role))
        for name, description, price, duration in SERVICES:
            db.execute("INSERT OR IGNORE INTO services(name,description,price_cents,duration_minutes) VALUES(?,?,?,?)",
                       (name, description, price, duration))
        barbers = db.execute("SELECT id,username FROM users WHERE role='barber'").fetchall()
        info = {
            "barber1": ("Senior Barber", "Skin fades · Classic cuts", 40, 0, "commission", "Detail-focused barber with a clean, consistent finish."),
            "barber2": ("Senior Barber", "Scissor cuts · Beard styling", 45, 0, "commission", "Specializes in classic cuts and beard shaping."),
        }
        for barber in barbers:
            title, specialty, commission, base, method, bio = info[barber["username"]]
            db.execute("INSERT OR IGNORE INTO barber_profiles(user_id,title,specialty,commission_percent,monthly_base_cents,pay_method,bio) VALUES(?,?,?,?,?,?,?)",
                       (barber["id"], title, specialty, commission, base, method, bio))
        db.commit()


def row_dict(row):
    return dict(row) if row is not None else None


def as_money(cents):
    return round((cents or 0) / 100, 2)


def parse_date_time(date_s, time_s):
    return datetime.datetime.strptime(date_s + " " + time_s, "%Y-%m-%d %H:%M")


def iso_now():
    return datetime.datetime.now().replace(microsecond=0).isoformat(sep=" ")


class Handler(BaseHTTPRequestHandler):
    server_version = "BarbershopDemo/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def send_json(self, data, status=200, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if headers:
            for key, val in headers.items(): self.send_header(key, val)
        self.end_headers(); self.wfile.write(body)

    def send_html(self):
        path = ROOT / "index.html"
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000: raise ValueError("Request is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict): raise ValueError("Invalid request body.")
        return data

    def get_session(self):
        cookie = self.headers.get("Cookie", "")
        token = None
        for part in cookie.split(";"):
            key, sep, value = part.strip().partition("=")
            if key == "bbms_session" and sep: token = value
        if not token: return None
        with SESSION_LOCK: uid = SESSIONS.get(token)
        if not uid: return None
        with connect() as db:
            row = db.execute("SELECT id,username,full_name,email,role,is_active FROM users WHERE id=?", (uid,)).fetchone()
            if not row or not row["is_active"]: return None
            return row_dict(row)

    def require_user(self, roles=None):
        user = self.get_session()
        if not user:
            self.send_json({"error": "Please log in first."}, 401); return None
        if roles and user["role"] not in roles:
            self.send_json({"error": "You do not have permission to perform this action."}, 403); return None
        return user

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self.send_html()
        user = self.get_session()
        with connect() as db:
            if path == "/api/me":
                return self.send_json({"user": user})
            if path == "/api/services":
                qs=parse_qs(urlparse(self.path).query)
                include_inactive=bool(user and user["role"]=="owner" and qs.get("all")==["1"])
                sql="SELECT id,name,description,price_cents,duration_minutes,is_active FROM services"
                if not include_inactive: sql += " WHERE is_active=1"
                rows = db.execute(sql+" ORDER BY id").fetchall()
                return self.send_json({"services": [{**row_dict(r), "price": as_money(r["price_cents"])} for r in rows]})
            if path == "/api/barbers":
                rows = db.execute("SELECT u.id,u.full_name,p.title,p.specialty,p.bio, COALESCE(AVG(r.rating),0) AS rating, COUNT(r.id) AS review_count FROM users u JOIN barber_profiles p ON p.user_id=u.id LEFT JOIN reviews r ON r.barber_id=u.id AND r.is_approved=1 WHERE u.is_active=1 GROUP BY u.id ORDER BY u.full_name").fetchall()
                return self.send_json({"barbers": [{**row_dict(r), "rating": round(r["rating"],1)} for r in rows]})
            if path == "/api/reviews":
                rows = db.execute("SELECT r.id,r.rating,r.comment,r.created_at,u.full_name AS customer,b.full_name AS barber,s.name AS service FROM reviews r JOIN users u ON u.id=r.customer_id JOIN users b ON b.id=r.barber_id JOIN appointments a ON a.id=r.appointment_id JOIN services s ON s.id=a.service_id WHERE r.is_approved=1 ORDER BY r.created_at DESC LIMIT 30").fetchall()
                return self.send_json({"reviews": [row_dict(r) for r in rows]})
            if path == "/api/reviews/pending":
                if not user or user["role"] not in ("admin", "owner"):
                    return self.send_json({"error":"Review moderation is limited to admins and the owner."},403)
                rows = db.execute("SELECT r.id,r.rating,r.comment,r.created_at,u.full_name AS customer,b.full_name AS barber,s.name AS service FROM reviews r JOIN users u ON u.id=r.customer_id JOIN users b ON b.id=r.barber_id JOIN appointments a ON a.id=r.appointment_id JOIN services s ON s.id=a.service_id WHERE r.is_approved=0 ORDER BY r.created_at DESC").fetchall()
                return self.send_json({"reviews": [row_dict(r) for r in rows]})
            if path == "/api/payroll":
                if not user or user["role"] != "owner":
                    return self.send_json({"error":"Only the owner can view cross-employee payroll estimates."},403)
                barbers = db.execute("SELECT u.id,u.full_name,p.pay_method,p.commission_percent,p.monthly_base_cents FROM users u JOIN barber_profiles p ON p.user_id=u.id WHERE u.role='barber' AND u.is_active=1 ORDER BY u.full_name").fetchall()
                result=[]
                for b in barbers:
                    earn=self.earnings_for(db,b["id"])
                    result.append({"id":b["id"],"full_name":b["full_name"],"pay_method":b["pay_method"],"commission_percent":b["commission_percent"],"base_salary":as_money(b["monthly_base_cents"]),"day":earn["day"],"week":earn["week"],"month":earn["month"],"all_time_commission":earn["all_time"]})
                return self.send_json({"payroll":result})
            if path == "/api/staff":
                if not user or user["role"] != "owner":
                    return self.send_json({"error":"Only the owner can manage staff accounts."},403)
                rows=db.execute("SELECT id,username,full_name,email,role,is_active,created_at FROM users WHERE role IN ('admin','barber') ORDER BY role,full_name").fetchall()
                return self.send_json({"staff":[row_dict(r) for r in rows]})
            if path == "/api/appointments":
                if not user: return self.send_json({"error":"Please log in first."},401)
                base = "SELECT a.*, c.full_name AS customer_name, b.full_name AS barber_name, s.name AS service_name, s.price_cents, s.duration_minutes FROM appointments a JOIN users c ON c.id=a.customer_id JOIN users b ON b.id=a.barber_id JOIN services s ON s.id=a.service_id"
                if user["role"] == "customer": rows = db.execute(base+" WHERE a.customer_id=? ORDER BY a.appointment_date DESC,a.start_time DESC",(user["id"],)).fetchall()
                elif user["role"] == "barber": rows = db.execute(base+" WHERE a.barber_id=? ORDER BY a.appointment_date,a.start_time",(user["id"],)).fetchall()
                else: rows = db.execute(base+" ORDER BY a.appointment_date DESC,a.start_time DESC").fetchall()
                return self.send_json({"appointments": [self.appointment_dict(r) for r in rows]})
            if path == "/api/dashboard":
                if not user: return self.send_json({"error":"Please log in first."},401)
                if user["role"] == "customer":
                    total=db.execute("SELECT COUNT(*) n FROM appointments WHERE customer_id=?",(user["id"],)).fetchone()["n"]
                    upcoming=db.execute("SELECT COUNT(*) n FROM appointments WHERE customer_id=? AND appointment_date>=date('now','localtime') AND status IN ('pending','confirmed','checked_in','in_service')",(user["id"],)).fetchone()["n"]
                    return self.send_json({"metrics":[{"label":"My bookings","value":total},{"label":"Upcoming","value":upcoming}]})
                if user["role"] == "barber":
                    vals=self.earnings_for(db,user["id"])
                    today=datetime.date.today().isoformat()
                    upcoming=db.execute("SELECT COUNT(*) n FROM appointments WHERE barber_id=? AND appointment_date=? AND status IN ('pending','confirmed','checked_in','in_service')",(user["id"],today)).fetchone()["n"]
                    return self.send_json({"metrics":[{"label":"Today's appointments","value":upcoming},{"label":"Earned this month","value":f"₱{vals['month']:.2f}"},{"label":"Earned this week","value":f"₱{vals['week']:.2f}"}],"earnings":vals})
                if user["role"] in ("admin","owner"):
                    query="SELECT COUNT(*) count, COALESCE(SUM(s.price_cents),0) revenue FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.status='completed'"
                    m=db.execute(query).fetchone()
                    outstanding=db.execute("SELECT COUNT(*) n FROM appointments WHERE status IN ('pending','confirmed','checked_in','in_service')").fetchone()["n"]
                    result={"metrics":[{"label":"Completed services","value":m["count"]},{"label":"Active bookings","value":outstanding}]}
                    if user["role"]=="owner":
                        exp=db.execute("SELECT COALESCE(SUM(amount_cents),0) n FROM expenses").fetchone()["n"]
                        result["metrics"] += [{"label":"Recorded revenue","value":f"₱{as_money(m['revenue']):,.2f}"},{"label":"Recorded expenses","value":f"₱{as_money(exp):,.2f}"},{"label":"Revenue less recorded expenses","value":f"₱{as_money(m['revenue']-exp):,.2f}"}]
                    return self.send_json(result)
        return self.send_json({"error":"Not found."},404)

    def appointment_dict(self, r):
        d=row_dict(r); d["price"]=as_money(d.pop("price_cents")); return d

    def earnings_for(self, db, barber_id):
        profile=db.execute("SELECT * FROM barber_profiles WHERE user_id=?",(barber_id,)).fetchone()
        if not profile: return {"day":0,"week":0,"month":0,"all_time":0,"method":"commission"}
        today=datetime.date.today(); week_start=today-datetime.timedelta(days=today.weekday()); month_start=today.replace(day=1)
        rows=db.execute("SELECT a.appointment_date,s.price_cents FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.barber_id=? AND a.status='completed' ORDER BY a.appointment_date",(barber_id,)).fetchall()
        values={"day":0,"week":0,"month":0,"all_time":0,"method":profile["pay_method"],"commission_percent":profile["commission_percent"]}
        for r in rows:
            try: d=datetime.date.fromisoformat(r["appointment_date"])
            except Exception: continue
            amount=as_money(round(r["price_cents"]*profile["commission_percent"]/100)) if profile["pay_method"] in ("commission","hybrid") else 0
            values["all_time"]+=amount
            if d==today: values["day"]+=amount
            if d>=week_start: values["week"]+=amount
            if d>=month_start: values["month"]+=amount
        if profile["pay_method"] in ("fixed","hybrid"):
            # In this demo the monthly base is included in the month view only, not distributed across days.
            values["month"] += as_money(profile["monthly_base_cents"])
        return {k:(round(v,2) if isinstance(v,(int,float)) else v) for k,v in values.items()}

    def do_POST(self):
        path=urlparse(self.path).path
        try: data=self.read_json()
        except Exception as e: return self.send_json({"error":str(e)},400)
        if path=="/api/register":
            full_name=str(data.get("full_name",""))[:100].strip(); email=str(data.get("email",""))[:150].strip().lower(); username=str(data.get("username",""))[:40].strip(); password=str(data.get("password",""))
            if len(full_name)<2 or len(username)<3 or not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}",username) or len(password)<8 or "@" not in email:
                return self.send_json({"error":"Enter a name, valid email, username (3+ letters/numbers), and password (at least 8 characters)."},400)
            with connect() as db:
                try:
                    cur=db.execute("INSERT INTO users(username,password_hash,full_name,email,role) VALUES(?,?,?,?, 'customer')",(username,pw_hash(password),full_name,email)); db.commit(); uid=cur.lastrowid
                except sqlite3.IntegrityError:
                    return self.send_json({"error":"That username or email is already registered."},409)
            token=secrets.token_urlsafe(32)
            with SESSION_LOCK: SESSIONS[token]=uid
            with connect() as db: row=db.execute("SELECT id,username,full_name,email,role FROM users WHERE id=?",(uid,)).fetchone()
            return self.send_json({"user":row_dict(row)},201,headers={"Set-Cookie":f"bbms_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"})
        if path=="/api/login":
            username=str(data.get("username",""))[:100].strip(); password=str(data.get("password","")); portal=str(data.get("portal","customer"))
            with connect() as db: row=db.execute("SELECT * FROM users WHERE username=? AND is_active=1",(username,)).fetchone()
            if not row or not pw_ok(password,row["password_hash"]): return self.send_json({"error":"Incorrect username or password."},401)
            if portal=="customer" and row["role"]!="customer": return self.send_json({"error":"This is the customer login. Use the staff login for staff accounts."},403)
            if portal=="staff" and row["role"] not in ("admin","barber","owner"): return self.send_json({"error":"Customer accounts must use the customer login."},403)
            token=secrets.token_urlsafe(32)
            with SESSION_LOCK: SESSIONS[token]=row["id"]
            user={"id":row["id"],"username":row["username"],"full_name":row["full_name"],"email":row["email"],"role":row["role"]}
            return self.send_json({"user":user},headers={"Set-Cookie":f"bbms_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"})
        if path=="/api/logout":
            cookie=self.headers.get("Cookie",""); token=None
            for part in cookie.split(";"):
                k,sep,v=part.strip().partition("=")
                if k=="bbms_session" and sep: token=v
            if token:
                with SESSION_LOCK: SESSIONS.pop(token,None)
            return self.send_json({"ok":True},headers={"Set-Cookie":"bbms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"})
        user=self.get_session()
        if not user: return self.send_json({"error":"Please log in first."},401)
        if path=="/api/appointments":
            if user["role"]!="customer": return self.send_json({"error":"Only customers can create bookings through this form."},403)
            try:
                barber_id=int(data.get("barber_id")); service_id=int(data.get("service_id")); date_s=str(data.get("appointment_date","")); time_s=str(data.get("start_time","")); note=str(data.get("customer_note",""))[:300]
                start=parse_date_time(date_s,time_s)
            except Exception: return self.send_json({"error":"Enter a valid barber, service, date, and time."},400)
            if start <= datetime.datetime.now(): return self.send_json({"error":"Choose a future date and time."},400)
            if start.weekday()==0: return self.send_json({"error":"The barbershop is closed on Mondays. Choose another day."},400)
            if start.hour<9 or (start.hour==18 and start.minute>0) or start.hour>=18 or start.minute not in (0,30):
                return self.send_json({"error":"Choose a start time between 9:00 AM and 5:30 PM, in 30-minute increments."},400)
            with connect() as db:
                service=db.execute("SELECT * FROM services WHERE id=? AND is_active=1",(service_id,)).fetchone()
                barber=db.execute("SELECT u.id FROM users u JOIN barber_profiles p ON p.user_id=u.id WHERE u.id=? AND u.role='barber' AND u.is_active=1",(barber_id,)).fetchone()
                if not service or not barber: return self.send_json({"error":"Choose an available service and barber."},400)
                end=start+datetime.timedelta(minutes=service["duration_minutes"])
                closing=start.replace(hour=18,minute=0)
                if end>closing: return self.send_json({"error":"That service would finish after closing. Choose an earlier time."},400)
                conflict=db.execute("SELECT a.id FROM appointments a WHERE a.barber_id=? AND a.appointment_date=? AND a.status NOT IN ('cancelled','no_show') AND a.start_time < ? AND a.end_time > ?",(barber_id,date_s,end.strftime("%H:%M"),time_s)).fetchone()
                if conflict: return self.send_json({"error":"That barber is already booked during this time. Please choose another time."},409)
                reference="BB-"+secrets.token_hex(3).upper()
                cur=db.execute("INSERT INTO appointments(reference_code,customer_id,barber_id,service_id,appointment_date,start_time,end_time,status,customer_note,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",(reference,user["id"],barber_id,service_id,date_s,time_s,end.strftime("%H:%M"),"confirmed",note,iso_now()))
                db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)",(user["id"],"create","appointment",cur.lastrowid,reference))
                db.commit(); aid=cur.lastrowid
            return self.send_json({"ok":True,"id":aid,"reference_code":reference},201)
        if path=="/api/appointments/action":
            try: aid=int(data.get("appointment_id")); action=str(data.get("action",""))
            except Exception: return self.send_json({"error":"Invalid appointment."},400)
            allowed={"confirm":"confirmed","check_in":"checked_in","start":"in_service","complete":"completed","cancel":"cancelled","no_show":"no_show"}
            if action not in allowed: return self.send_json({"error":"Unsupported action."},400)
            with connect() as db:
                a=db.execute("SELECT * FROM appointments WHERE id=?",(aid,)).fetchone()
                if not a: return self.send_json({"error":"Booking not found."},404)
                role=user["role"]
                if role=="customer":
                    if a["customer_id"]!=user["id"] or action!="cancel": return self.send_json({"error":"Customers can only cancel their own bookings."},403)
                    when=parse_date_time(a["appointment_date"],a["start_time"])
                    if when-datetime.datetime.now()<datetime.timedelta(hours=24): return self.send_json({"error":"Bookings can only be cancelled at least 24 hours before the appointment. Contact the shop for urgent changes."},400)
                elif role=="barber":
                    if a["barber_id"]!=user["id"] or action not in ("check_in","start","complete","no_show"): return self.send_json({"error":"Barbers can update the status of their assigned bookings only."},403)
                elif role not in ("admin","owner"): return self.send_json({"error":"Permission denied."},403)
                target=allowed[action]
                valid_transitions={"pending":{"confirmed","cancelled"},"confirmed":{"checked_in","cancelled","no_show"},"checked_in":{"in_service","cancelled"},"in_service":{"completed"},"completed":set(),"cancelled":set(),"no_show":set()}
                if target not in valid_transitions.get(a["status"],set()): return self.send_json({"error":f"Cannot change status from {a['status']} to {target}."},400)
                db.execute("UPDATE appointments SET status=?,updated_at=? WHERE id=?",(target,iso_now(),aid))
                db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)",(user["id"],"status:"+target,"appointment",aid,""))
                db.commit()
            return self.send_json({"ok":True,"status":target})
        if path=="/api/reviews/action":
            if user["role"] not in ("admin","owner"): return self.send_json({"error":"Only admins and the owner can moderate reviews."},403)
            try: rid=int(data.get("review_id")); action=str(data.get("action",""))
            except Exception: return self.send_json({"error":"Invalid review."},400)
            if action not in ("approve","hide"): return self.send_json({"error":"Choose approve or hide."},400)
            with connect() as db:
                exists=db.execute("SELECT id FROM reviews WHERE id=?",(rid,)).fetchone()
                if not exists: return self.send_json({"error":"Review not found."},404)
                if action == "approve": db.execute("UPDATE reviews SET is_approved=1 WHERE id=?",(rid,))
                else: db.execute("DELETE FROM reviews WHERE id=?",(rid,))
                db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)",(user["id"],"review:"+action,"review",rid,"")); db.commit()
            return self.send_json({"ok":True})
        if path=="/api/staff/manage":
            if user["role"]!="owner": return self.send_json({"error":"Only the owner can manage staff accounts."},403)
            if data.get("user_id"):
                try: target_id=int(data.get("user_id")); active=bool(data.get("is_active"))
                except Exception: return self.send_json({"error":"Invalid staff account update."},400)
                with connect() as db:
                    target=db.execute("SELECT id,role FROM users WHERE id=? AND role IN ('admin','barber')",(target_id,)).fetchone()
                    if not target: return self.send_json({"error":"Staff account not found."},404)
                    db.execute("UPDATE users SET is_active=? WHERE id=?",(1 if active else 0,target_id))
                    db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)",(user["id"],"staff_active:"+str(active),"user",target_id,"")); db.commit()
                return self.send_json({"ok":True,"is_active":active})
            try:
                username=str(data.get("username",""))[:40].strip(); full_name=str(data.get("full_name",""))[:100].strip(); email=str(data.get("email",""))[:150].strip().lower(); password=str(data.get("password","")); role=str(data.get("role",""))
                if len(full_name)<2 or not re.fullmatch(r"[A-Za-z0-9_.-]{3,40}",username) or len(password)<8 or "@" not in email or role not in ("admin","barber"):
                    raise ValueError()
                pay_method=str(data.get("pay_method","commission")); commission=float(data.get("commission_percent",40)); base=int(round(float(data.get("monthly_base",0))*100))
                if pay_method not in ("fixed","commission","hybrid") or not 0<=commission<=100 or base<0: raise ValueError()
            except Exception: return self.send_json({"error":"Enter a name, valid email, username (3+ characters), password (8+ characters), staff role, and valid pay rule."},400)
            with connect() as db:
                try:
                    cur=db.execute("INSERT INTO users(username,password_hash,full_name,email,role) VALUES(?,?,?,?,?)",(username,pw_hash(password),full_name,email,role)); target_id=cur.lastrowid
                    if role=="barber":
                        db.execute("INSERT INTO barber_profiles(user_id,title,specialty,commission_percent,monthly_base_cents,pay_method,bio) VALUES(?,?,?,?,?,?,?)",(target_id,"Barber","",commission,base,pay_method,"New barber profile"))
                    db.execute("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)",(user["id"],"staff_create","user",target_id,role)); db.commit()
                except sqlite3.IntegrityError: return self.send_json({"error":"That username or email is already in use."},409)
            return self.send_json({"ok":True,"user_id":target_id,"role":role},201)
        if path=="/api/services/manage":
            if user["role"]!="owner": return self.send_json({"error":"Only the owner can manage service listings and prices."},403)
            try:
                service_id=data.get("service_id"); name=str(data.get("name",""))[:100].strip(); description=str(data.get("description",""))[:400].strip(); price_cents=int(round(float(data.get("price",0))*100)); duration=int(data.get("duration_minutes",30)); active=1 if data.get("is_active",True) else 0
                if not name or price_cents<0 or duration<5 or duration>240: raise ValueError()
            except Exception: return self.send_json({"error":"Enter a name, non-negative price, and duration between 5 and 240 minutes."},400)
            with connect() as db:
                try:
                    if service_id:
                        db.execute("UPDATE services SET name=?,description=?,price_cents=?,duration_minutes=?,is_active=? WHERE id=?",(name,description,price_cents,duration,active,int(service_id)))
                        if db.total_changes==0: return self.send_json({"error":"Service not found."},404)
                    else:
                        db.execute("INSERT INTO services(name,description,price_cents,duration_minutes,is_active) VALUES(?,?,?,?,?)",(name,description,price_cents,duration,active))
                    db.commit()
                except sqlite3.IntegrityError: return self.send_json({"error":"A service with that name already exists."},409)
            return self.send_json({"ok":True})
        if path=="/api/reviews":
            if user["role"]!="customer": return self.send_json({"error":"Only customers can submit reviews."},403)
            try: aid=int(data.get("appointment_id")); rating=int(data.get("rating")); comment=str(data.get("comment",""))[:500]
            except Exception: return self.send_json({"error":"Enter a valid rating and appointment."},400)
            if rating<1 or rating>5: return self.send_json({"error":"Rating must be from 1 to 5."},400)
            with connect() as db:
                a=db.execute("SELECT * FROM appointments WHERE id=? AND customer_id=?",(aid,user["id"])).fetchone()
                if not a or a["status"]!="completed": return self.send_json({"error":"You can review only your own completed appointments."},403)
                try:
                    db.execute("INSERT INTO reviews(appointment_id,customer_id,barber_id,rating,comment,is_approved) VALUES(?,?,?,?,?,0)",(aid,user["id"],a["barber_id"],rating,comment)); db.commit()
                except sqlite3.IntegrityError: return self.send_json({"error":"A review has already been submitted for this appointment."},409)
            return self.send_json({"ok":True},201)
        if path=="/api/expenses":
            if user["role"]!="owner": return self.send_json({"error":"Only the owner can record expenses."},403)
            try: amount=int(round(float(data.get("amount",0))*100)); category=str(data.get("category","Other"))[:80]; description=str(data.get("description",""))[:200]; date_s=str(data.get("expense_date",datetime.date.today().isoformat())); datetime.date.fromisoformat(date_s)
            except Exception: return self.send_json({"error":"Enter a valid expense."},400)
            if amount<0: return self.send_json({"error":"Amount cannot be negative."},400)
            with connect() as db:
                db.execute("INSERT INTO expenses(expense_date,category,description,amount_cents,created_by) VALUES(?,?,?,?,?)",(date_s,category,description,amount,user["id"])); db.commit()
            return self.send_json({"ok":True},201)
        if path=="/api/pay-rules":
            if user["role"]!="owner": return self.send_json({"error":"Only the owner can update pay rules."},403)
            try: barber_id=int(data.get("barber_id")); method=str(data.get("pay_method")); commission=float(data.get("commission_percent",0)); base=int(round(float(data.get("monthly_base",0))*100))
            except Exception: return self.send_json({"error":"Invalid pay rule."},400)
            if method not in ("fixed","commission","hybrid") or not 0<=commission<=100 or base<0: return self.send_json({"error":"Check pay method, commission (0–100), and base salary."},400)
            with connect() as db:
                exists=db.execute("SELECT id FROM users WHERE id=? AND role='barber'",(barber_id,)).fetchone()
                if not exists: return self.send_json({"error":"Barber not found."},404)
                db.execute("UPDATE barber_profiles SET pay_method=?,commission_percent=?,monthly_base_cents=? WHERE user_id=?",(method,commission,base,barber_id)); db.commit()
            return self.send_json({"ok":True},201)
        return self.send_json({"error":"Not found."},404)

    def do_HEAD(self):
        self.send_response(200); self.end_headers()


def main():
    seed_db()
    print("\nBarbershop Booking Management System demo")
    print(f"Open http://{HOST}:{PORT} in your browser")
    print("Demo logins: customer/customer123 | admin/admin123 | barber1/barber123 | owner/owner123")
    print("Press Ctrl+C to stop. Data is stored in app/barbershop.db.\n")
    try:
        ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__=="__main__": main()
