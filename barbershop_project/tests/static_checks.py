"""Static checks for the Barbershop Booking Management System.

Run from the project folder with: python tests/static_checks.py
These checks validate file references and code syntax. They do not connect to Supabase.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = []

def check(condition, message):
    checks.append((condition, message))
    if not condition:
        errors.append(message)

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = ROOT / "css" / "styles.css"
app_js = ROOT / "js" / "app.js"
config_js = ROOT / "js" / "config.js"
schema = ROOT / "supabase" / "schema.sql"

check(css.exists() and 'href="css/styles.css"' in html, "index.html must reference css/styles.css")
check(app_js.exists() and 'src="js/app.js"' in html, "index.html must reference js/app.js")
check(config_js.exists() and 'src="js/config.js"' in html, "index.html must reference js/config.js")
check(schema.exists(), "Supabase schema file must exist")
check((ROOT / "diagrams" / "booking_flow.png").exists(), "Booking flowchart PNG must exist")
check((ROOT / "diagrams" / "role_access.png").exists(), "Role-access flowchart PNG must exist")
check((ROOT / "diagrams" / "use_case.png").exists(), "Use-case diagram PNG must exist")
check((ROOT / "docs" / "Project_Documentation.docx").exists(), "Project documentation DOCX must exist")
check((ROOT / "docs" / "Project_Progress_Report.docx").exists(), "Progress report DOCX must exist")
check("SUPABASE_URL" in config_js.read_text(encoding="utf-8"), "Config must contain the Supabase URL setting")
check("PASTE_YOUR_SUPABASE" in config_js.read_text(encoding="utf-8"), "Unconfigured build should clearly show the setup placeholders")
check("enable row level security" in schema.read_text(encoding="utf-8").lower(), "Schema must explicitly enable row-level security")
for required in ["book_appointment", "get_available_slots", "cancel_my_booking", "owner_set_staff_role", "appointments_no_overlap"]:
    check(required in schema.read_text(encoding="utf-8"), f"Schema must include {required}")
check("DEMO_SERVICES" in app_js.read_text(encoding="utf-8"), "Frontend preview services should be clearly marked")
check("service_role" in (ROOT / "README.md").read_text(encoding="utf-8"), "README must warn against putting service_role in browser code")
schema_text = schema.read_text(encoding="utf-8").lower()
check("and status = 'pending'" in schema_text and "and moderated_by is null" in schema_text, "Customers must not be able to submit pre-approved reviews")
check("grant update (status, moderated_by, moderated_at) on public.reviews to authenticated" in schema_text, "Review updates should be restricted to moderation fields")
for name in ["booking_flow.dot", "role_access.dot", "use_case.dot"]:
    check((ROOT / "diagrams" / name).exists() and "docs/CUSTOMIZATION_GUIDE.md" in (ROOT / "diagrams" / name).read_text(encoding="utf-8"), f"{name} should include editing guidance")
check("QUICK EDIT" in html, "HTML should include guidance for changing visible text")
check("QUICK DESIGN GUIDE" in css.read_text(encoding="utf-8"), "CSS should explain where design colors and spacing can be changed")

# Parse JavaScript if Node.js is installed.
node = subprocess.run(["node", "--check", str(app_js)], capture_output=True, text=True) if __import__('shutil').which("node") else None
if node is None:
    check(True, "Node.js unavailable; JavaScript syntax check skipped")
else:
    check(node.returncode == 0, "js/app.js must pass node --check" + (f": {node.stderr.strip()}" if node.returncode else ""))
    node2 = subprocess.run(["node", "--check", str(config_js)], capture_output=True, text=True)
    check(node2.returncode == 0, "js/config.js must pass node --check" + (f": {node2.stderr.strip()}" if node2.returncode else ""))

for ok, message in checks:
    print(f"{'PASS' if ok else 'FAIL'}: {message}")
print(f"\n{sum(ok for ok, _ in checks)} / {len(checks)} checks passed.")
if errors:
    sys.exit(1)
