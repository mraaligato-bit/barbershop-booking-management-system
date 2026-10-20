# Barbershop Booking Management System

A self-contained local prototype for a Computer Engineering Software Design project. It includes a responsive public website, customer registration/login, role-based staff login, appointment booking with overlap checks, booking status updates, customer reviews with moderation, barber earnings estimates, owner expense records and pay-rule/service configuration, SQL schema, diagrams, project documentation, a test plan, and a presentation.

## Start the application

Requirements: Python 3.10 or later. The app uses only Python's standard library; no `pip install` is required.

1. Extract the ZIP file.
2. Open a terminal in `barbershop_project/app/`.
3. Run `python app.py`.
4. Open `http://127.0.0.1:8000` in a browser on the same computer.
5. Stop the server with `Ctrl+C`.

The SQLite database is generated automatically at `app/barbershop.db` the first time the app starts. To reset all prototype data, stop the server and delete that database file; the next launch recreates the demo accounts and services.

## Sample accounts

| Role | Username | Password |
|---|---|---|
| Customer | `customer` | `customer123` |
| Admin | `admin` | `admin123` |
| Barber / employee | `barber1` | `barber123` |
| Barber / employee | `barber2` | `barber123` |
| Owner | `owner` | `owner123` |

Select **Customer login** for the customer account. Select **Staff login** for admin, barber, and owner accounts. New customer registration is available from the customer login.

## Key files

- `app/app.py` — Python standard-library HTTP server, API, authentication, and appointment business rules.
- `app/index.html` — responsive UI and client-side behavior.
- `database_schema.sql` — SQLite schema for users, services, barber profiles, appointments, reviews, expenses, and audit records.
- `diagrams/booking_flow.png` / `.svg` — booking engineering flowchart with diamond decision nodes.
- `diagrams/role_access.png` / `.svg` — role-based login and access flow.
- `diagrams/use_case.png` / `.svg` — high-level use-case overview.
- `docs/Project_Documentation.docx` — requirements, system design, database description, test plan, setup, and limitations.
- `docs/Project_Progress_Report.docx` — editable progress and individual contribution draft.
- `docs/Project_Presentation.pptx` — project overview slides.
- `docs/Test_Plan.csv` — test cases and prototype smoke-test results.

## Included implemented demo behavior

- Public service, barber, and approved-review sections.
- Separate customer and staff login portals, with the account's assigned role deciding the dashboard.
- Customer registration, booking, viewing personal booking history, and cancellation subject to a 24-hour rule.
- Service-duration and opening-hours validation; overlapping appointments for the same barber are rejected.
- Barber schedule and status actions for assigned bookings.
- Admin booking operations and review moderation.
- Owner staff account creation/deactivation, service/pricing updates, expense recording, pay-rule configuration, cross-barber earnings estimates, and business summary metrics.
- Customer review submission only for a completed personal appointment; public publication requires moderation.

## Important limitations

This is a classroom prototype, not a production-ready service. Its in-memory sessions disappear when the server restarts. It binds to `127.0.0.1`, does not send actual email/SMS notifications, does not process payments, and has no calendar/scheduling integration. The sample credentials are public by design. There is no HTTPS, production-grade CSRF protection, rate-limiting, password recovery, professional payroll/accounting integration, or deployment hardening. Before real use, the system needs a security review, production session handling, backups, TLS, stronger operational logging, validated opening hours/pay policies, and real user acceptance testing.

## Booking rules used by the demo

- Opening schedule: Tuesday through Sunday, 9:00 AM–6:00 PM; closed Mondays. Individual barber shifts, breaks, and leave days are not separately modeled yet.
- Appointment start times use 30-minute increments and must be in the future.
- The full service duration must end by closing time.
- Overlap checks exclude cancelled and no-show appointments.
- Customers can cancel only their own bookings and must do so at least 24 hours before the appointment.
- Only the assigned barber or authorized staff can update appointment status.
- Reviews are available only after a customer's appointment is marked completed and remain hidden until an admin or owner approves them.
- Barber commissions are calculated from completed service value using the owner-configured commission rate. Fixed/hybrid base pay is shown in the monthly estimate. These are estimates and are not payroll approvals.

## Notes for the project submission

The latest clean API smoke-test run passed all 19 scripted API cases. Full UI inspection, stakeholder acceptance, and production security tests remain outstanding.

The reports are working drafts. Confirm all assumptions with the group and instructor, especially actual shop hours, cancellation policy, barber pay rules, and whether the chosen implementation technology is allowed. The project-progress percentage is an estimate of the prototype artifact package, not a verified measure of the entire class group's work. The individual contribution section must match the student's real contribution.
