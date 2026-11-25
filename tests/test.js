// Doctor Appointment BD \u2014 Node unit tests. Run: node tests/test.js (exit 0 = all pass).
// Every expected value below was hand-verified against the rules in js/logic.js.
'use strict';
const assert = require('node:assert');
const L = require('../js/logic.js');
const D = require('../js/data.js');

let pass = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  PASS ' + name); }
  catch (e) { console.log('  FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; }
}

function mkDoctor(over) {
  return Object.assign({
    id: 'd1', name: 'Dr. Test', specialty: 'Medicine', chamber: 'City Hospital',
    phone: '+8801712345678', fee: 800, days: ['Sat', 'Mon']
  }, over || {});
}
function mkAppt(over) {
  return Object.assign({
    id: 'a1', doctorId: 'd1', doctorName: 'Dr. Test', date: '2026-12-01', time: '10:00',
    patient: 'Rahim', reason: 'Fever', status: 'upcoming', feeAtBooking: 800,
    feePaid: null, visitNotes: '', createdAt: '2026-11-25T10:00:00.000Z'
  }, over || {});
}
// Fixed "now" for deterministic tests: 2026-11-25 12:00 local.
const NOW = new Date(2026, 10, 25, 12, 0, 0).getTime();

// ---------- dates & times ----------
check('isValidDate accepts 2026-11-25, rejects 2026-02-29 / 2026-02-30 / month 13 / garbage', () => {
  assert.strictEqual(L.isValidDate('2026-11-25'), true);
  assert.strictEqual(L.isValidDate('2024-02-29'), true);
  assert.strictEqual(L.isValidDate('2026-02-29'), false);
  assert.strictEqual(L.isValidDate('2026-02-30'), false);
  assert.strictEqual(L.isValidDate('2026-13-01'), false);
  assert.strictEqual(L.isValidDate('25-11-2026'), false);
  assert.strictEqual(L.isValidDate(''), false);
  assert.strictEqual(L.isValidDate(null), false);
});
check('isValidTime accepts 10:00 and 23:59, rejects 24:00 / 9:00 / 10:60 / empty', () => {
  assert.strictEqual(L.isValidTime('10:00'), true);
  assert.strictEqual(L.isValidTime('23:59'), true);
  assert.strictEqual(L.isValidTime('00:00'), true);
  assert.strictEqual(L.isValidTime('24:00'), false);
  assert.strictEqual(L.isValidTime('9:00'), false);
  assert.strictEqual(L.isValidTime('10:60'), false);
  assert.strictEqual(L.isValidTime(''), false);
});
check('addDays: 2026-11-25 +1 -> 2026-11-26, +7 -> 2026-12-02, month rollover', () => {
  assert.strictEqual(L.addDays('2026-11-25', 1), '2026-11-26');
  assert.strictEqual(L.addDays('2026-11-25', 7), '2026-12-02');
  assert.strictEqual(L.addDays('2026-11-30', 1), '2026-12-01');
  assert.strictEqual(L.addDays('2026-12-31', 1), '2027-01-01');
});
check('daysUntil: today=0, tomorrow=1, yesterday=-1, +10 days, leap span', () => {
  assert.strictEqual(L.daysUntil('2026-11-25', '2026-11-25'), 0);
  assert.strictEqual(L.daysUntil('2026-11-26', '2026-11-25'), 1);
  assert.strictEqual(L.daysUntil('2026-11-24', '2026-11-25'), -1);
  assert.strictEqual(L.daysUntil('2026-12-05', '2026-11-25'), 10);
  assert.strictEqual(L.daysUntil('2024-03-01', '2024-02-28'), 2); // leap year: Feb 29 counts
  assert.strictEqual(L.daysUntil('bad-date', '2026-11-25'), null);
});

// ---------- Bengali digits / fee ----------
check('bnDigits converts 2026 -> \u09e8\u09e6\u09e8\u09ec and keeps punctuation', () => {
  assert.strictEqual(L.bnDigits('2026'), '\u09e8\u09e6\u09e8\u09ec');
  assert.strictEqual(L.bnDigits('Tk 1,200'), 'Tk \u09e7,\u09e8\u09e6\u09e6');
  assert.strictEqual(L.bnDigits('10:00'), '\u09e7\u09e6:\u09e6\u09e6');
});
check('localizeNumber: en keeps digits, bn converts', () => {
  assert.strictEqual(L.localizeNumber(42, 'en'), '42');
  assert.strictEqual(L.localizeNumber(42, 'bn'), '\u09ea\u09e8');
});
check('groupThousands: 1200 -> 1,200; 1000000 -> 1,000,000; 800 -> 800', () => {
  assert.strictEqual(L.groupThousands(1200), '1,200');
  assert.strictEqual(L.groupThousands(1000000), '1,000,000');
  assert.strictEqual(L.groupThousands(800), '800');
  assert.strictEqual(L.groupThousands(0), '0');
});
check('formatFee: 800 -> "Tk 800", 1200 bn -> "Tk \u09e7,\u09e8\u09e6\u09e6", null/"" -> ""', () => {
  assert.strictEqual(L.formatFee(800, 'en'), 'Tk 800');
  assert.strictEqual(L.formatFee(1200, 'en'), 'Tk 1,200');
  assert.strictEqual(L.formatFee(1200, 'bn'), 'Tk \u09e7,\u09e8\u09e6\u09e6');
  assert.strictEqual(L.formatFee(null, 'en'), '');
  assert.strictEqual(L.formatFee('', 'en'), '');
  assert.strictEqual(L.formatFee(-5, 'en'), '');
});

// ---------- phone ----------
check('validatePhone: BD mobile +8801712345678 ok; 7 digits ok; 6 digits / letters / bad chars rejected', () => {
  assert.deepStrictEqual(L.validatePhone('+8801712345678'), []);
  assert.deepStrictEqual(L.validatePhone('01712-345678'), []);
  assert.deepStrictEqual(L.validatePhone('1234567'), []);
  assert.deepStrictEqual(L.validatePhone(''), []);
  assert.deepStrictEqual(L.validatePhone(null), []);
  assert.deepStrictEqual(L.validatePhone('123456'), ['phone-invalid']);
  assert.deepStrictEqual(L.validatePhone('01712abc456'), ['phone-invalid']);
  assert.deepStrictEqual(L.validatePhone('01712.345678'), ['phone-invalid']);
  assert.deepStrictEqual(L.validatePhone('1'.repeat(16)), ['phone-invalid']);
});

// ---------- doctor validation ----------
check('validateDoctor: a full valid doctor passes', () => {
  assert.deepStrictEqual(L.validateDoctor(mkDoctor()), []);
});
check('validateDoctor: missing name / missing chamber / bad specialty rejected', () => {
  assert.ok(L.validateDoctor(mkDoctor({ name: '' })).includes('name-required'));
  assert.ok(L.validateDoctor(mkDoctor({ name: '   ' })).includes('name-required'));
  assert.ok(L.validateDoctor(mkDoctor({ chamber: '' })).includes('chamber-required'));
  assert.ok(L.validateDoctor(mkDoctor({ specialty: 'Magic' })).includes('specialty-invalid'));
});
check('validateDoctor: 81-char name / 121-char chamber / bad phone / bad fee / no days rejected', () => {
  assert.ok(L.validateDoctor(mkDoctor({ name: 'x'.repeat(81) })).includes('name-too-long'));
  assert.ok(L.validateDoctor(mkDoctor({ chamber: 'x'.repeat(121) })).includes('chamber-too-long'));
  assert.ok(L.validateDoctor(mkDoctor({ phone: 'abc' })).includes('phone-invalid'));
  assert.ok(L.validateDoctor(mkDoctor({ fee: -1 })).includes('fee-invalid'));
  assert.ok(L.validateDoctor(mkDoctor({ fee: 1000001 })).includes('fee-invalid'));
  assert.ok(L.validateDoctor(mkDoctor({ fee: 12.5 })).includes('fee-invalid'));
  assert.ok(L.validateDoctor(mkDoctor({ days: [] })).includes('days-required'));
  assert.ok(L.validateDoctor(mkDoctor({ days: ['Funday'] })).includes('days-invalid'));
});
check('validateDoctor: fee 0 and fee null are both fine; phone optional', () => {
  assert.deepStrictEqual(L.validateDoctor(mkDoctor({ fee: 0 })), []);
  assert.deepStrictEqual(L.validateDoctor(mkDoctor({ fee: null, phone: '' })), []);
});
check('SPECIALTIES: exactly 14, includes all fixed list values', () => {
  assert.strictEqual(L.SPECIALTIES.length, 14);
  ['Medicine', 'Cardiology', 'Pediatrics', 'Gynecology & Obstetrics', 'Dermatology',
   'Orthopedics', 'ENT', 'Eye', 'Dental', 'Psychiatry', 'Surgery', 'Neurology',
   'Diabetes & Endocrinology', 'Other'].forEach((s) => assert.ok(L.SPECIALTIES.includes(s), s));
});
check('DAYS: Mon..Sun in order, 7 days', () => {
  assert.deepStrictEqual(L.DAYS, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

// ---------- appointment validation ----------
check('validateAppointment: a future appointment passes', () => {
  assert.deepStrictEqual(L.validateAppointment(mkAppt(), [mkDoctor()], { nowMs: NOW }), []);
});
check('validateAppointment: past date+time rejected for upcoming (same-day 09:00 vs now 12:00)', () => {
  const past = mkAppt({ date: '2026-11-25', time: '09:00' });
  assert.ok(L.validateAppointment(past, [mkDoctor()], { nowMs: NOW }).includes('date-in-past'));
});
check('validateAppointment: same-day later time (15:00) is fine; tomorrow is fine', () => {
  assert.deepStrictEqual(L.validateAppointment(mkAppt({ date: '2026-11-25', time: '15:00' }), [mkDoctor()], { nowMs: NOW }), []);
  assert.deepStrictEqual(L.validateAppointment(mkAppt({ date: '2026-11-26', time: '09:00' }), [mkDoctor()], { nowMs: NOW }), []);
});
check('validateAppointment: missing doctor / unknown doctor / missing date+time / missing patient rejected', () => {
  assert.ok(L.validateAppointment(mkAppt({ doctorId: '' }), [mkDoctor()], { nowMs: NOW }).includes('doctor-required'));
  assert.ok(L.validateAppointment(mkAppt({ doctorId: 'dX' }), [mkDoctor()], { nowMs: NOW }).includes('doctor-not-found'));
  assert.ok(L.validateAppointment(mkAppt({ date: '' }), [mkDoctor()], { nowMs: NOW }).includes('date-required'));
  assert.ok(L.validateAppointment(mkAppt({ date: '2026-02-30' }), [mkDoctor()], { nowMs: NOW }).includes('date-invalid'));
  assert.ok(L.validateAppointment(mkAppt({ time: '' }), [mkDoctor()], { nowMs: NOW }).includes('time-required'));
  assert.ok(L.validateAppointment(mkAppt({ time: '25:00' }), [mkDoctor()], { nowMs: NOW }).includes('time-invalid'));
  assert.ok(L.validateAppointment(mkAppt({ patient: '' }), [mkDoctor()], { nowMs: NOW }).includes('patient-required'));
});
check('validateAppointment: 501-char reason / 2001-char notes rejected; completed/cancelled skip past check', () => {
  assert.ok(L.validateAppointment(mkAppt({ reason: 'x'.repeat(501) }), [mkDoctor()], { nowMs: NOW }).includes('reason-too-long'));
  assert.ok(L.validateAppointment(mkAppt({ visitNotes: 'x'.repeat(2001) }), [mkDoctor()], { nowMs: NOW }).includes('notes-too-long'));
  assert.deepStrictEqual(L.validateAppointment(mkAppt({ date: '2026-11-20', status: 'completed', feePaid: 800 }), [mkDoctor()], { nowMs: NOW }), []);
  assert.deepStrictEqual(L.validateAppointment(mkAppt({ date: '2026-11-20', status: 'cancelled' }), [mkDoctor()], { nowMs: NOW }), []);
});
check('validateAppointment: allowPast lets an overdue upcoming appointment through (import case)', () => {
  const past = mkAppt({ date: '2026-11-20', time: '09:00' });
  assert.ok(L.validateAppointment(past, [mkDoctor()], { nowMs: NOW }).includes('date-in-past'));
  assert.deepStrictEqual(L.validateAppointment(past, [mkDoctor()], { nowMs: NOW, allowPast: true }), []);
});

// ---------- overdue / sorting ----------
check('isOverdue: upcoming past datetime true; future false; completed/cancelled never', () => {
  assert.strictEqual(L.isOverdue(mkAppt({ date: '2026-11-25', time: '09:00' }), NOW), true);
  assert.strictEqual(L.isOverdue(mkAppt({ date: '2026-11-25', time: '15:00' }), NOW), false);
  assert.strictEqual(L.isOverdue(mkAppt({ date: '2026-11-20', time: '09:00' }), NOW), true);
  assert.strictEqual(L.isOverdue(mkAppt({ date: '2026-11-20', time: '09:00', status: 'completed' }), NOW), false);
  assert.strictEqual(L.isOverdue(mkAppt({ date: '2026-11-20', time: '09:00', status: 'cancelled' }), NOW), false);
});
check('sortAppointments: by date then time; same slot keeps creation order', () => {
  const list = [
    mkAppt({ id: 'a3', date: '2026-12-02', time: '09:00' }),
    mkAppt({ id: 'a1', date: '2026-12-01', time: '15:00' }),
    mkAppt({ id: 'a2', date: '2026-12-01', time: '09:00' })
  ];
  assert.deepStrictEqual(L.sortAppointments(list).map((a) => a.id), ['a2', 'a1', 'a3']);
});
check('appointmentsOn: filters one date, sorted by time', () => {
  const list = [
    mkAppt({ id: 'a1', date: '2026-12-01', time: '15:00' }),
    mkAppt({ id: 'a2', date: '2026-12-02', time: '09:00' }),
    mkAppt({ id: 'a3', date: '2026-12-01', time: '09:00' })
  ];
  assert.deepStrictEqual(L.appointmentsOn(list, '2026-12-01').map((a) => a.id), ['a3', 'a1']);
});
check('upcomingAppointments: only upcoming, sorted', () => {
  const list = [
    mkAppt({ id: 'a1', date: '2026-12-02', time: '09:00' }),
    mkAppt({ id: 'a2', date: '2026-12-01', time: '09:00', status: 'completed' }),
    mkAppt({ id: 'a3', date: '2026-12-01', time: '10:00' })
  ];
  assert.deepStrictEqual(L.upcomingAppointments(list).map((a) => a.id), ['a3', 'a1']);
});

// ---------- search / filter ----------
check('searchDoctors: matches name/chamber/specialty/phone, case-insensitive; empty returns all', () => {
  const list = [
    mkDoctor({ id: 'd1', name: 'Dr. Ayesha', chamber: 'Square Hospital', specialty: 'Cardiology' }),
    mkDoctor({ id: 'd2', name: 'Dr. Kamal', chamber: 'Popular Diagnostics', specialty: 'Eye', phone: '01987654321' })
  ];
  assert.strictEqual(L.searchDoctors(list, 'ayesha').length, 1);
  assert.strictEqual(L.searchDoctors(list, 'SQUARE').length, 1);
  assert.strictEqual(L.searchDoctors(list, 'eye').length, 1);
  assert.strictEqual(L.searchDoctors(list, '0171').length, 1);
  assert.strictEqual(L.searchDoctors(list, 'zzz').length, 0);
  assert.strictEqual(L.searchDoctors(list, '').length, 2);
});
check('filterDoctorsBySpecialty + sortDoctors: filter works, sort is alphabetical', () => {
  const list = [
    mkDoctor({ id: 'd1', name: 'Zahid', specialty: 'Eye' }),
    mkDoctor({ id: 'd2', name: 'Ayesha', specialty: 'Cardiology' }),
    mkDoctor({ id: 'd3', name: 'Kamal', specialty: 'Eye' })
  ];
  assert.strictEqual(L.filterDoctorsBySpecialty(list, 'Eye').length, 2);
  assert.strictEqual(L.filterDoctorsBySpecialty(list, 'all').length, 3);
  assert.deepStrictEqual(L.sortDoctors(list).map((d) => d.name), ['Ayesha', 'Kamal', 'Zahid']);
});
check('doctorById + appointmentsForDoctor', () => {
  const docs = [mkDoctor({ id: 'd1' }), mkDoctor({ id: 'd2', name: 'Other' })];
  assert.strictEqual(L.doctorById(docs, 'd2').name, 'Other');
  assert.strictEqual(L.doctorById(docs, 'dX'), null);
  const appts = [
    mkAppt({ id: 'a1', doctorId: 'd2', date: '2026-12-02', time: '09:00' }),
    mkAppt({ id: 'a2', doctorId: 'd1', date: '2026-12-01', time: '09:00' }),
    mkAppt({ id: 'a3', doctorId: 'd2', date: '2026-12-01', time: '09:00' })
  ];
  assert.deepStrictEqual(L.appointmentsForDoctor(appts, 'd2').map((a) => a.id), ['a3', 'a1']);
});

// ---------- stats / completion ----------
check('stats: counts + feesPaid sum only completed feePaid + overdue count (hand-verified)', () => {
  const docs = [mkDoctor({ id: 'd1' }), mkDoctor({ id: 'd2' })];
  const appts = [
    mkAppt({ id: 'a1', date: '2026-11-25', time: '15:00' }), // upcoming, future
    mkAppt({ id: 'a2', date: '2026-11-25', time: '09:00' }), // upcoming, overdue
    mkAppt({ id: 'a3', date: '2026-11-20', time: '09:00', status: 'completed', feePaid: 800 }),
    mkAppt({ id: 'a4', date: '2026-11-21', time: '09:00', status: 'completed', feePaid: 500 }),
    mkAppt({ id: 'a5', date: '2026-11-22', time: '09:00', status: 'completed', feePaid: null }), // no fee
    mkAppt({ id: 'a6', date: '2026-11-23', time: '09:00', status: 'cancelled' })
  ];
  const s = L.stats(docs, appts, NOW);
  assert.strictEqual(s.doctors, 2);
  assert.strictEqual(s.upcoming, 2);
  assert.strictEqual(s.completed, 3);
  assert.strictEqual(s.cancelled, 1);
  assert.strictEqual(s.feesPaid, 1300); // 800 + 500, null-fee visit adds 0
  assert.strictEqual(s.overdue, 1);
});
check('completeAppointment: status completed, feePaid = feeAtBooking snapshot (800)', () => {
  const done = L.completeAppointment(mkAppt({ feeAtBooking: 800 }));
  assert.strictEqual(done.status, 'completed');
  assert.strictEqual(done.feePaid, 800);
  assert.strictEqual(done.date, '2026-12-01');
});
check('completeAppointment: no fee set -> feePaid stays null', () => {
  const done = L.completeAppointment(mkAppt({ feeAtBooking: null }));
  assert.strictEqual(done.feePaid, null);
});
check('blankDoctor / blankAppointment: sane defaults, valid except required fields', () => {
  const d = L.blankDoctor();
  assert.strictEqual(d.specialty, 'Medicine');
  assert.deepStrictEqual(d.days, []);
  assert.deepStrictEqual(L.validateDoctor(d), ['name-required', 'chamber-required', 'days-required']);
  const a = L.blankAppointment();
  assert.strictEqual(a.status, 'upcoming');
  assert.strictEqual(a.feePaid, null);
  assert.ok(L.validateAppointment(a, [], {}).includes('doctor-required'));
});

// ---------- import / export ----------
check('validateImport: wrong app / version / bad arrays / duplicate ids rejected', () => {
  assert.strictEqual(L.validateImport(null).ok, false);
  assert.strictEqual(L.validateImport({ app: 'other', version: 1, doctors: [], appointments: [] }).error, 'wrong-app');
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 2, doctors: [], appointments: [] }).error, 'wrong-version');
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 1, doctors: 'no', appointments: [] }).error, 'doctors-not-array');
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 1, doctors: [], appointments: 'no' }).error, 'appointments-not-array');
  const dup = mkDoctor();
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 1, doctors: [dup, dup], appointments: [] }).error, 'duplicate-id');
  const badDoc = mkDoctor({ name: '' });
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 1, doctors: [badDoc], appointments: [] }).ok, false);
  const badAppt = mkAppt({ patient: '' });
  assert.strictEqual(L.validateImport({ app: 'doctor-appointment-bd', version: 1, doctors: [mkDoctor()], appointments: [badAppt] }).ok, false);
});
check('validateImport accepts a well-formed export; buildExport round-trips (counts 1/1)', () => {
  const exp = L.buildExport([mkDoctor()], [mkAppt()]);
  assert.strictEqual(exp.app, 'doctor-appointment-bd');
  assert.strictEqual(exp.version, 1);
  const res = L.validateImport(exp);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.doctors, 1);
  assert.strictEqual(res.appointments, 1);
});
check('validateImport accepts an export where the appointment doctor was deleted (skipDoctorCheck)', () => {
  const exp = L.buildExport([], [mkAppt()]);
  assert.strictEqual(L.validateImport(exp).ok, true);
});

// ---------- i18n integrity ----------
check('STR: en and bn have exactly the same keys, all non-empty', () => {
  const enKeys = Object.keys(D.STR.en).sort();
  const bnKeys = Object.keys(D.STR.bn).sort();
  assert.deepStrictEqual(bnKeys, enKeys);
  enKeys.forEach((k) => {
    assert.ok(D.STR.en[k].length > 0, 'en.' + k);
    assert.ok(D.STR.bn[k].length > 0, 'bn.' + k);
  });
});
check('SPEC_KEY covers all 14 specialties; DAY_KEY covers all 7 days', () => {
  L.SPECIALTIES.forEach((s) => assert.ok(D.SPEC_KEY[s], s));
  assert.strictEqual(Object.keys(D.SPEC_KEY).length, 14);
  L.DAYS.forEach((d) => assert.ok(D.DAY_KEY[d], d));
  assert.strictEqual(Object.keys(D.DAY_KEY).length, 7);
});
check('STR specialty labels: BN Cardiology is \u09b9\u09c3\u09a6\u09b0\u09cb\u0997, BN Medicine is \u09ae\u09c7\u09a1\u09bf\u09b8\u09bf\u09a8', () => {
  assert.strictEqual(D.STR.bn.specCardiology, '\u09b9\u09c3\u09a6\u09b0\u09cb\u0997');
  assert.strictEqual(D.STR.bn.specMedicine, '\u09ae\u09c7\u09a1\u09bf\u09b8\u09bf\u09a8');
  assert.strictEqual(D.STR.en.specCardiology, 'Cardiology');
});

console.log('\n' + pass + ' unit tests passed.');
