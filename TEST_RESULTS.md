# Doctor Appointment BD — Test Results

Run: factory 16:00 slot, 2026-11-25 (run #441 at record time).
Date verified: Wed 2026-11-25, Asia/Dhaka.

## Unit tests — 38/38 PASS

`node tests/test.js` (exit 0, 2026-11-25 ~16:20 +06; re-run green after ASCII conversion, ~16:35 +06)

- Dates & times: 2026-11-25 valid; 2024-02-29 accepted, 2026-02-29 / 2026-02-30 / month 13 / DD-MM-YYYY / empty / null rejected; 10:00, 23:59, 00:00 valid; 24:00, 9:00, 10:60, empty rejected.
- Date math (hand-verified): addDays 2026-11-25 +1 → 2026-11-26, +7 → 2026-12-02, 2026-11-30 +1 → 2026-12-01, 2026-12-31 +1 → 2027-01-01; daysUntil today=0, tomorrow=1, yesterday=-1, +10 days, leap span 2024-02-28 → 2024-03-01 = 2; bad date → null.
- Bengali digits / fees: 2026 → ২০২৬, 'Tk 1,200' → 'Tk ১,২০০', '10:00' → '১০:০০'; localizeNumber keeps digits in EN, converts in BN; groupThousands 1200 → '1,200', 1000000 → '1,000,000'; formatFee 800 → 'Tk 800', 1200 bn → 'Tk ১,২০০', null/''/negative → ''.
- Phone: +8801712345678, 01712-345678, 7 digits, empty and null pass; 6 digits, letters, '.' and 16 digits rejected.
- Doctor validation: full valid doctor passes; missing name/chamber, bad specialty rejected; 81-char name, 121-char chamber, bad phone, fee -1 / 1,000,001 / 12.5, empty days, bad day rejected; fee 0 and fee null both fine; exactly 14 specialties, days Mon–Sun in order.
- Appointment validation: future appointment passes; same-day 09:00 vs fixed now 12:00 rejected as past, same-day 15:00 and tomorrow fine; missing/unknown doctor, missing/bad date/time, missing patient rejected; 501-char reason / 2001-char notes rejected; completed/cancelled skip the past check; allowPast lets an overdue upcoming appointment through (import case).
- Overdue / sorting: upcoming past datetime overdue, future not, completed/cancelled never; sort by date then time; appointmentsOn filters one date sorted by time; upcomingAppointments returns only upcoming, sorted.
- Search / filter: matches name/chamber/specialty/phone case-insensitively, empty query returns all; specialty filter works; sort alphabetical; doctorById + appointmentsForDoctor correct.
- Stats (hand-verified): 2 doctors, 2 upcoming, 3 completed, 1 cancelled, feesPaid 1300 (800 + 500; a null-fee completed visit adds 0), overdue 1.
- Completion: feePaid = feeAtBooking snapshot (800); no fee set → feePaid stays null.
- Blanks: blankDoctor defaults to Medicine with no days, errors are exactly name/chamber/days-required; blankAppointment is upcoming with feePaid null.
- Import/export: wrong app/version, non-array doctors/appointments, duplicate ids, invalid doctor/appointment all rejected; a well-formed export round-trips (counts 1/1); an export whose appointment's doctor was deleted still imports.
- i18n: EN and BN string tables have exactly the same keys, all non-empty; SPEC_KEY covers all 14 specialties, DAY_KEY all 7 days; BN Cardiology is হৃদরোগ, BN Medicine is মেডিসিন.

## Headless-Chrome smoke tests — 60/60 PASS at 1280×800, 60/60 PASS at 390×844

`node tests/smoke.mjs 1280` and `node tests/smoke.mjs 390` (exit 0, 2026-11-25 ~16:30 +06; re-run green after ASCII conversion, ~16:35 +06). 0 console errors, 0 failed network requests, no horizontal overflow at both widths.

- Load: title, heading, 5 tabs, dashboard empty state, '0 doctors' stats.
- Doctors: empty form submit shows 'name is required', still 0 doctors; adding Dr. Ayesha Rahman (Cardiology, Square Hospital, +8801712345678, Tk 800, Sat+Mon) stores 1 doctor, card shows name/fee/chamber/days, form clears.
- Appointments: yesterday's date rejected ('in the past'), still 0 appointments; booking tomorrow 10:00 for Rahim Uddin stores 1, card shows 'Tomorrow' + 'Tk 800'; edit time to 11:00 (doctor select disabled in edit mode) shows 11:00.
- Dashboard: tomorrow section shows the appointment; stats show 1 upcoming.
- Complete: marking completed makes fees-paid stat 'Tk 800', completed count 1, stored feePaid 800.
- History: completed visit listed, notes field present; saving 'Prescribed rest and follow-up in 2 weeks.' shows 'Notes saved' and persists.
- Cancel: second appointment (Karim Hossain, day after tomorrow) books, then cancels into the cancelled list (count 1).
- Doctors: second doctor added; search 'second' → 1 card, 'zzz-no-match' → 0, cleared → 2; specialty filter Cardiology → 1, All → 2.
- Language: toggle → বাংলা tagline, 'ড্যাশবোর্ড' tab label, Bengali digits '২' in stats; toggle back → English.
- Data: Export/Import buttons present; export JSON parses, app 'doctor-appointment-bd', version 1, 2 doctors + 2 appointments; erase with prompt 'no' keeps data; 'DELETE' erases doctors and appointments to 0, message shown, dashboard empty again.

## Repair cycles

1. **Test bug (test-only, fixed in the test):** `searchDoctors` '0171' matched 2 doctors because both test fixtures shared the default phone. Gave the second fixture its own number (01987654321). Re-ran: 38/38.
2. **Real UX bug (fixed in the product):** `renderDoctors()` rebuilt and reset the doctor form on every render, so typing in the search box would wipe a half-filled form. Forms are now built once in `init()`; renders only refresh lists. Re-ran smoke: the flow stayed green.
3. **Real i18n bug (fixed in the product):** after a language toggle, hidden tabs kept stale English text, because `renderAll()` only re-rendered the visible tab. `renderAll()` now refreshes all four tabs. (This surfaced as 'BN stats use Bengali digits' failing.)
4. **Real i18n bug (fixed in the product):** dashboard stat counts were rendered with raw `String(n)`, never localized, so they stayed Western digits in বাংলা mode. Counts now go through `fmtNum` (Bengali digits in BN mode). Re-ran: 60/60 at both widths.

## ASCII safety

All `js/*.js` and `tests/*.js` files were converted to pure ASCII (`\uXXXX` escapes) after authoring, and the tests were re-run green after conversion (38/38 unit, 60/60 smoke @1280, 60/60 smoke @390). `index.html` keeps one literal Bengali word (the 'বাংলা' language button, same as prior factory runs); the push payload is built with `ensure_ascii=True` in `prepare-push.py`, so no non-ASCII byte travels through argv. `prepare-push.py` output verified 2026-11-25 ~16:37 +06: chunk-a 56,434 bytes, chunk-b 73,795 bytes (both under 90KB, both pure ASCII).
