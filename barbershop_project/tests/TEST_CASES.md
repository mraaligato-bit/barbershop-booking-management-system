# Manual Test Cases

Use these after your own Supabase project has been configured in `js/config.js` and the SQL in `supabase/schema.sql` has run successfully. Create separate accounts for different roles. Record the actual result and date in your group's test log.

| ID | Role | Test | Expected result | Current status |
|---|---|---|---|---|
| T01 | Public visitor | Open the homepage while config still has placeholders | Preview notice and sample service/barber cards appear; no booking is saved | Static check only |
| T02 | Customer | Register with a new email and valid password | Supabase creates the account and profile with role Customer | Not run against live project |
| T03 | Customer | Sign in with a customer account | Customer dashboard opens | Not run against live project |
| T04 | Customer | Select service, barber, date, and time | Available times are shown for the selected date | Not run against live project |
| T05 | Customer | Confirm an available appointment | A confirmed appointment appears in the customer's list | Not run against live project |
| T06 | Customer | Try booking the same barber and overlapping time with another account | Database rejects the second booking | Not run against live project |
| T07 | Customer | Try to query another customer's appointment through the Supabase client | RLS does not return the other customer's row | Not run against live project |
| T08 | Customer | Try to cancel a booking that starts in less than 24 hours | Database refuses cancellation under the current policy | Not run against live project |
| T09 | Customer | Submit a review for a completed appointment | Review is saved as pending and does not appear publicly yet | Not run against live project |
| T10 | Customer | Submit a review for a booking that is not completed | Database refuses the review | Not run against live project |
| T11 | Admin | Open the Admin dashboard | Admin can view bookings, availability, and reviews | Not run against live project |
| T12 | Admin | Change a barber's work hours and save | Updated schedule is stored and new slot list reflects it | Not run against live project |
| T13 | Admin | Approve a pending review | Review status changes to approved and public list can show it | Not run against live project |
| T14 | Barber | Sign in and view assigned bookings | Only that barber's assignments are returned | Not run against live project |
| T15 | Barber | Change a booking from confirmed to checked in to in service to completed | Valid status transitions work; invalid transitions are rejected | Not run against live project |
| T16 | Barber | Open the earnings panel | Only the signed-in barber's pay settings and estimates are shown | Not run against live project |
| T17 | Owner | Add or edit a service | Public service menu reflects the saved values | Not run against live project |
| T18 | Owner | Assign a customer account the Barber role | Barber profile, availability, and pay-settings records are created | Not run against live project |
| T19 | Owner | Record an expense | Expense appears in Owner reports and reduces estimated remainder | Not run against live project |
| T20 | Customer | Try to call `owner_set_staff_role` or read pay settings for another barber | Database refuses the unauthorized request | Not run against live project |
| T21 | Published site | Register and click the email confirmation link | Link returns to the correct GitHub Pages URL and sign-in succeeds | Not run against live project |

## Test reporting note

`python tests/static_checks.py` checks the package files and JavaScript syntax. It does not replace these live tests. Mark a manual test Passed only after recording what happened in the configured system. If a test fails, save the error message and check the relevant RLS policy or function before using real data.
