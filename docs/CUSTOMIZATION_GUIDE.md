# Quick Guide: Changing the Website

Keep this guide open beside the code while editing. For most changes, you only need one file.

## Change the shop name or public wording

Open `index.html`. Search for `NORTHLINE`, `BARBERSHOP`, `Your next cut`, or the text you want to change. Update the header and footer brand at the same time so they match. The current name is only sample branding.

## Change the colors

Open `css/styles.css` and find `:root` near the top. Start with these variables:

- `--ink`: dark green-black background and text
- `--paper`: main page background
- `--paper-2`: alternate background
- `--accent`: gold highlights and primary buttons
- `--muted`: secondary text
- `--radius`: general corner shape

Change the value, save, and refresh the page. Keep text contrast readable.

## Change the sample service cards

Before Supabase is connected, the page uses `DEMO_SERVICES` inside `js/app.js`. These are preview records only. Once Supabase is connected, the Owner should edit the real service menu in the Owner dashboard. The database, not the JavaScript array, is the live source of prices and service duration.

## Change a barber's profile

With Supabase configured, sign in as Owner and open the Barber Profiles section. You can edit the display name, short bio, specialties, and pay settings. Only use real staff names and photos with their permission.

## Change appointment rules

Open `supabase/schema.sql`. Search for `get_available_slots`, `book_appointment`, or `cancel_my_booking`. These functions enforce availability, service duration, price at booking, and the 24-hour cancellation policy. If you change a rule, update the flowchart, documentation, and test cases too. Do not just change the message in the browser; the database must enforce the rule.

## Change opening hours

The default is Tuesday through Sunday, 9 AM to 6 PM, with a 1 PM to 2 PM break. The Admin or Owner dashboard lets you edit the start, end, and break times for each day. Verify that any new hours fit existing appointments. The SQL trigger inserts default hours when a new barber profile is first created.

## Change the currency or timezone

The frontend currency formatter is named `MONEY` in `js/app.js`; it is currently PHP. The date helpers and SQL scheduling functions use `Asia/Manila`. Changing the displayed currency alone will not update database prices or convert money, and changing timezone requires updating the frontend date helpers and SQL functions together.

## Update the diagrams

The diagrams are generated from Graphviz `.dot` files in `diagrams/`. Edit the text in `booking_flow.dot`, `role_access.dot`, or `use_case.dot`, then regenerate the PNG and SVG files:

```bash
# Run these from the project folder if Graphviz is installed.
dot -Tpng -Gdpi=160 diagrams/booking_flow.dot -o diagrams/booking_flow.png
dot -Tsvg diagrams/booking_flow.dot -o diagrams/booking_flow.svg
dot -Tpng -Gdpi=160 diagrams/role_access.dot -o diagrams/role_access.png
dot -Tsvg diagrams/role_access.dot -o diagrams/role_access.svg
dot -Tpng -Gdpi=160 diagrams/use_case.dot -o diagrams/use_case.png
dot -Tsvg diagrams/use_case.dot -o diagrams/use_case.svg
```

## Keep the documents in sync

If a feature, rule, or role permission changes, update `docs/Project_Documentation.docx`, `docs/Project_Progress_Report.docx`, `docs/Test_Plan.csv`, and `docs/TEST_CASES.md`. Record whether a test passed only after it has been run in the configured project.
