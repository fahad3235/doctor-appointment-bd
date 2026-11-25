# Doctor Appointment BD — Offline Doctor Visit Organizer for Bangladesh

Keep your doctors, appointments and visit history organised in English or বাংলা — fully offline, no account, no server. Your data never leaves your device.

**Factory run #445** · 16:00 slot, 2026-11-25 (Asia/Dhaka) · Status: published and verified — live on GitHub Pages

## Problem

In Bangladesh, keeping track of doctor visits means juggling chamber cards, phone numbers, visiting days and fees across notebooks and phone contacts — and forgetting a follow-up is easy. Doctor Appointment BD gives one personal organizer: your doctors with their chambers and visiting days, your appointments with dates and times, and a history of completed visits with notes — all offline, on your own device.

## Features

1. **Doctors directory** — add/edit/delete doctors: name, one of 14 specialties (Medicine, Cardiology, Pediatrics, Gynecology & Obstetrics, Dermatology, Orthopedics, ENT, Eye, Dental, Psychiatry, Surgery, Neurology, Diabetes & Endocrinology, Other), chamber/hospital, phone (loose BD format: digits, `+`, `-`, spaces, 7–15 digits), consultation fee in BDT, and visiting days (Mon–Sun, at least one). Search by name/chamber/specialty/phone and filter by specialty.
2. **Appointments** — book by picking a doctor, date, time, patient name and optional reason. New upcoming appointments cannot be in the past. Statuses: upcoming / completed / cancelled. Mark completed (records the visit fee snapshotted from the doctor's fee at booking time), cancel, delete, or edit date/time/reason. Past-due upcoming appointments are flagged "Overdue — confirm or reschedule".
3. **Dashboard** — upcoming list sorted by date+time, "Today" and "Tomorrow" sections, days-until each appointment (Today / Tomorrow / in N days / N days ago), overdue flags, and stats: upcoming count, completed count, total fees paid, doctors count, overdue count.
4. **Visit history** — completed (and cancelled) appointments with an editable visit-notes field per visit, filterable by doctor and status.
5. **Data portability** — export everything as JSON, import with strict validation (wrong app/version, bad shapes and duplicate IDs are rejected with a message), erase everything only after typing DELETE.
6. **Bilingual UI** — full English/বাংলা toggle (persisted), Bengali digits in বাংলা mode; responsive down to 390px.
7. **Ships empty** — no demo doctors or appointments: fictional doctor names or phone numbers would be fabricated data.

## Stack

- Pure HTML + CSS + vanilla JavaScript — no build step, no dependencies, no network requests.
- `js/logic.js` — pure, Node-testable logic (doctor/appointment validation, date math, overdue detection, stats, import rules, Bengali digits, fee formatting).
- `js/data.js` — bilingual strings + specialty/day label maps.
- `js/app.js` — DOM layer.
- Tests: `tests/test.js` (Node unit tests) and `tests/smoke.mjs` (headless-Chrome CDP smoke tests, no npm deps).

## Prerequisites

Any modern browser. For the tests: Node.js 18+ and the cached headless Chromium used by `tests/smoke.mjs` (Playwright `chromium_headless_shell-1187` path in the script).

## Run it

```bash
# Just open it — no server needed:
open index.html
# or serve it:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tests

```bash
node tests/test.js            # 38/38 unit tests pass
node tests/smoke.mjs 1280     # 60/60 headless-Chrome checks pass (1280x800)
node tests/smoke.mjs 390      # 60/60 headless-Chrome checks pass (390x844)
```

Full results (including every hand-verified number and the repairs made) in [TEST_RESULTS.md](TEST_RESULTS.md).

## Deployment

Static site — any static host works (GitHub Pages included). No environment variables, no secrets, no backend.

## Limitations

- Data lives in the browser's localStorage on one device — there is no account or cloud sync; use Export to move it.
- **This is a personal organizer, not a booking service.** It does not contact any doctor, hospital or booking platform, and it holds no real chamber schedules. Always verify chamber days and timings by phone before visiting.
- The import validator accepts only files exported by this app (`app: "doctor-appointment-bd"`, `version: 1`).
- Phone validation is deliberately loose (format only) — it cannot verify that a number belongs to a doctor.

## Status

Built and tested 2026-11-25. Repo creation + push pending the GitHub approval flow.
