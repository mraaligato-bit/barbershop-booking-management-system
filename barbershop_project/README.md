# Barbershop Booking Management System

This is the browser-based version of our barbershop project. The frontend uses plain HTML, CSS, and JavaScript. Supabase provides the account system and shared database. There is no Python server to run for this version.

The starting brand name on the page is **Northline Barbershop**. It is sample branding for the project, so change it if your group has a real shop name.

## What is included

- Homepage, services, barber profiles, and approved reviews
- Customer account registration and sign-in
- Separate Customer Login and Staff Login entry points
- Customer bookings, booking history, cancellation rules, and reviews
- Admin booking management, schedule availability, and review moderation
- Barber schedules, job status updates, and their own earnings estimates
- Owner controls for services, staff roles, barber profiles, pay settings, expenses, and reports
- Supabase database schema with Row Level Security (RLS), booking functions, and overlap protection
- Aligned engineering flowcharts, use-case diagram, requirements document, progress report, test plan, and presentation

## 1. Open the website on your laptop

You can preview the layout without setting up the database:

1. Extract this project folder.
2. Double-click `index.html`, or use VS Code Live Server if you have it.
3. The yellow Preview Mode notice means Supabase has not been configured yet. The sample services, barbers, and reviews are only for layout preview. Sign-in and booking are not active in preview mode.

For real accounts and appointments, complete the Supabase setup below.

## 2. Create the Supabase database

1. Create a project at [Supabase](https://supabase.com/).
2. Open **SQL Editor** in that project.
3. Open `supabase/schema.sql` from this folder, copy the whole file, paste it into a new SQL query, and run it.
4. Confirm the query completes successfully. It creates the tables, row-level security policies, booking functions, default barber hours, and six sample services.
5. Replace the sample service names, descriptions, prices, and durations with the real menu through the Owner dashboard.

Default barber hours are **Tuesday to Sunday, 9:00 AM to 6:00 PM, with a 1:00–2:00 PM break**. Monday is closed. Update the availability table or use the Admin/Owner dashboard if the real hours are different.

## 3. Connect the website to Supabase

1. In Supabase, open the project API settings.
2. Copy the **Project URL** and the **publishable key** (or legacy `anon` key).
3. Open `js/config.js` in a code editor.
4. Replace the two `PASTE_...` placeholder values, keeping the quote marks.
5. Save and refresh the website.

**Never paste a `service_role` key or other secret key into `js/config.js`.** Browser files are visible to anyone who visits the site. The public key is only safe for this use because the database policies limit which actions each role can do.

## 4. Make the site public with GitHub Pages

This repository currently has the earlier Python version inside the `barbershop_project` folder. For the static version, the important change is to put the new `index.html` at the **root of the GitHub repository** (not only inside a subfolder).

1. Make a backup or new branch before replacing files.
2. Copy `index.html`, the `css`, `js`, `supabase`, `diagrams`, `docs`, and `tests` folders, `.nojekyll`, and this `README.md` into the root of your local repository.
3. Keep the existing `barbershop_project` folder as a backup until the new version is working. GitHub Pages will use the root `index.html`.
4. Commit and push the updated files to the `main` branch.
5. On GitHub, open **Settings → Pages**.
6. Choose **Deploy from a branch**, select `main`, choose `/(root)`, and save.
7. Wait for GitHub Pages to finish. The expected project address is `https://mraaligato-bit.github.io/barbershop-booking-management-system/`. Use the link GitHub shows if it differs.

GitHub's official guide: [GitHub Pages quickstart](https://docs.github.com/en/pages/quickstart).

## 5. Set the Supabase Auth redirect address

In Supabase, open **Authentication → URL Configuration**.

- Set the Site URL to `https://mraaligato-bit.github.io/barbershop-booking-management-system/` after GitHub Pages is published.
- Add that same URL to the allowed redirect URLs.
- For local testing, also allow your local address (for example, `http://localhost:5500/**` when using VS Code Live Server).
- Decide if email confirmation should be required. When confirmation is on, users must click their confirmation email before signing in.

Test registration, confirmation, and sign-in again from the published website after changing these settings.

## 6. Create the first Owner account

1. Open the website and choose **Customer login → Create customer account**.
2. Register using the email address that should control the shop.
3. Confirm the email if Supabase requires it.
4. In Supabase SQL Editor, run the following command after replacing the sample email with the one you registered. Do this only for your own Owner account.

```sql
update public.profiles
set role = 'owner', updated_at = now()
where id = (
  select id from auth.users
  where lower(email) = lower('YOUR_EMAIL_HERE')
);
```

5. Sign in again using **Staff login**. Your account should open the Owner dashboard.
6. Have each staff member register or be invited to Supabase Auth first. From the Owner dashboard, assign that account the Barber or Admin role. Public sign-up always starts with the Customer role.
7. When a user is assigned the Barber role, the database creates a barber profile, default availability, and pay settings. Update those details before the shop uses the booking calendar.

## 7. Customize the page

| Change | File or place |
|---|---|
| Shop name, page headings, buttons, explanatory text | `index.html` |
| Colors, type, spacing, borders, layout, mobile view | `css/styles.css` — start in `:root` |
| Supabase Project URL and public key | `js/config.js` |
| Preview-only sample services and barber cards | `js/app.js` — `DEMO_SERVICES` and `DEMO_BARBERS` |
| Currency, date formatting, booking form, dashboard behavior | `js/app.js` — comments at the top |
| Actual service list / starter prices | Owner dashboard or seed rows near the bottom of `supabase/schema.sql` |
| Roles, table rules, and booking validation | `supabase/schema.sql` |
| Booking and login diagrams | `diagrams/booking_flow.dot` and `diagrams/role_access.dot` |
| Project write-up and progress report | `docs/` |

CSS tip: Change one or two `:root` variables at a time and refresh. `--paper` changes the warm background, `--ink` controls the dark green-black parts, and `--accent` changes the gold highlights.

## 8. How booking works

- A customer selects a service, barber, date, and available time.
- The booking form asks Supabase for open 15-minute start intervals based on the barber's hours, break, service duration, and existing appointments.
- When the customer confirms, the database checks the slot again and uses an exclusion constraint to prevent overlapping active appointments for the same barber.
- The service price and duration are read from the database, not trusted from the browser.
- Customers can cancel their own confirmed booking only at least 24 hours before it starts.
- Customers can submit a review only for their own completed appointment. Reviews need Admin or Owner approval before appearing publicly.
- Barbers update a booking through confirmed → checked in → in service → completed, or mark a valid no-show.
- Commission estimates are calculated from completed services and the Owner's configured pay rules. The numbers are estimates; final payroll should be checked separately.

## 9. What has and has not been tested

The static code checks verify that the expected files exist, the JavaScript parses, the HTML points to the correct assets, and the SQL includes the key RLS policies/functions. They do **not** prove that the hosted Supabase project is configured correctly. Run the test cases in `tests/TEST_CASES.md` after setting up your own Supabase project.

Before sharing the site, make test accounts for all four roles and verify that a customer cannot see another customer's bookings, a barber cannot see another barber's pay, and a regular user cannot promote their own account. If anything fails, stop and review the SQL policies before using real customer information.

## Current limits

This is a school project version. It does not send automatic SMS/email reminders, accept payments, handle refunds, calculate tax, or provide a full accounting system. Email delivery depends on the Supabase Auth settings. A free database plan can also have usage limits. Keep backups and do not use sample prices or sample barber profiles as if they were the real shop's information.
