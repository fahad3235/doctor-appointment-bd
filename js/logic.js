// Doctor Appointment BD \u2014 pure logic (no DOM). Node-testable and browser-safe.
// Ships empty: no demo doctors or appointments anywhere.
'use strict';

var APP_ID = 'doctor-appointment-bd';
var APP_VERSION = 1;

var SPECIALTIES = [
  'Medicine', 'Cardiology', 'Pediatrics', 'Gynecology & Obstetrics',
  'Dermatology', 'Orthopedics', 'ENT', 'Eye', 'Dental',
  'Psychiatry', 'Surgery', 'Neurology', 'Diabetes & Endocrinology', 'Other'
];

var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
var STATUSES = ['upcoming', 'completed', 'cancelled'];

var MAX_NAME_CHARS = 80;
var MAX_CHAMBER_CHARS = 120;
var MAX_PHONE_DIGITS = 15;
var MIN_PHONE_DIGITS = 7;
var MAX_FEE = 1000000;
var MAX_REASON_CHARS = 500;
var MAX_NOTES_CHARS = 2000;
var MAX_DOCTORS = 200;
var MAX_APPOINTMENTS = 1000;

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}

function blankDoctor() {
  return {
    id: uid('d'), name: '', specialty: 'Medicine', chamber: '',
    phone: '', fee: null, days: []
  };
}

function blankAppointment() {
  return {
    id: uid('a'), doctorId: '', date: '', time: '', patient: '',
    reason: '', status: 'upcoming', feeAtBooking: null, feePaid: null,
    visitNotes: '', createdAt: new Date().toISOString()
  };
}

// ---------- dates ----------
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  var p = str.split('-');
  var y = +p[0], m = +p[1], d = +p[2];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  var dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTime(str) {
  if (typeof str !== 'string' || !/^\d{2}:\d{2}$/.test(str)) return false;
  var h = +str.slice(0, 2), m = +str.slice(3, 5);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function localToday() {
  var n = new Date();
  return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
}

function addDays(dateStr, n) {
  var p = dateStr.split('-');
  var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
}

// Whole days from todayStr to dateStr: today -> 0, tomorrow -> 1, yesterday -> -1.
function daysUntil(dateStr, todayStr) {
  if (!isValidDate(dateStr)) return null;
  var t = todayStr || localToday();
  if (!isValidDate(t)) return null;
  var a = dateStr.split('-'), b = t.split('-');
  var ms = Date.UTC(+a[0], +a[1] - 1, +a[2]) - Date.UTC(+b[0], +b[1] - 1, +b[2]);
  return Math.round(ms / 86400000);
}

// Local-time milliseconds for an appointment's date+time (for overdue checks).
function appointmentMs(appt) {
  if (!isValidDate(appt.date) || !isValidTime(appt.time)) return NaN;
  var d = appt.date.split('-');
  return new Date(+d[0], +d[1] - 1, +d[2], +appt.time.slice(0, 2), +appt.time.slice(3, 5), 0, 0).getTime();
}

// An upcoming appointment whose date+time has passed.
function isOverdue(appt, nowMs) {
  if (!appt || appt.status !== 'upcoming') return false;
  var ms = appointmentMs(appt);
  if (isNaN(ms)) return false;
  var now = (typeof nowMs === 'number') ? nowMs : Date.now();
  return ms < now;
}

// ---------- Bengali digits / fee formatting ----------
var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
function bnDigits(input) {
  return String(input).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
}
function localizeNumber(input, lang) {
  return lang === 'bn' ? bnDigits(input) : String(input);
}
function groupThousands(n) {
  var s = String(Math.floor(Math.abs(n)));
  var out = '';
  while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
  return s + out;
}
// 'Tk 1,200' in EN, 'Tk \u09e7,\u09e8\u09e6\u09e6' in BN. Null/undefined fee -> ''.
function formatFee(amount, lang) {
  if (amount === null || amount === undefined || amount === '') return '';
  var n = Number(amount);
  if (isNaN(n) || n < 0) return '';
  return 'Tk ' + localizeNumber(groupThousands(n), lang);
}

// ---------- validation ----------
function validatePhone(phone) {
  if (phone === null || phone === undefined || phone === '') return [];
  if (typeof phone !== 'string') return ['phone-invalid'];
  if (!/^[0-9+\- ]+$/.test(phone)) return ['phone-invalid'];
  var digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) return ['phone-invalid'];
  return [];
}

function validateDoctor(d) {
  if (!d || typeof d !== 'object') return ['doctor-missing'];
  var errs = [];
  if (!d.name || !String(d.name).trim()) errs.push('name-required');
  else if (d.name.length > MAX_NAME_CHARS) errs.push('name-too-long');
  if (SPECIALTIES.indexOf(d.specialty) === -1) errs.push('specialty-invalid');
  if (!d.chamber || !String(d.chamber).trim()) errs.push('chamber-required');
  else if (d.chamber.length > MAX_CHAMBER_CHARS) errs.push('chamber-too-long');
  errs = errs.concat(validatePhone(d.phone));
  if (d.fee !== null && d.fee !== undefined && d.fee !== '') {
    var f = Number(d.fee);
    if (isNaN(f) || f < 0 || f > MAX_FEE || Math.floor(f) !== f) errs.push('fee-invalid');
  }
  if (!Array.isArray(d.days) || d.days.length === 0) errs.push('days-required');
  else {
    d.days.forEach(function (day) {
      if (DAYS.indexOf(day) === -1) errs.push('days-invalid');
    });
  }
  return errs;
}

// options: { nowMs, allowPast, skipDoctorCheck } \u2014 allowPast is for imports
// (overdue upcoming appointments are a real state, not invalid data);
// skipDoctorCheck is for imports too (appointments survive a deleted doctor).
function validateAppointment(a, doctors, options) {
  if (!a || typeof a !== 'object') return ['appointment-missing'];
  var opts = options || {};
  var errs = [];
  if (!a.doctorId || typeof a.doctorId !== 'string') errs.push('doctor-required');
  else if (!opts.skipDoctorCheck && Array.isArray(doctors) && !doctors.some(function (d) { return d.id === a.doctorId; })) {
    errs.push('doctor-not-found');
  }
  if (!a.date || !String(a.date).trim()) errs.push('date-required');
  else if (!isValidDate(a.date)) errs.push('date-invalid');
  if (!a.time || !String(a.time).trim()) errs.push('time-required');
  else if (!isValidTime(a.time)) errs.push('time-invalid');
  if (!a.patient || !String(a.patient).trim()) errs.push('patient-required');
  else if (a.patient.length > MAX_NAME_CHARS) errs.push('patient-too-long');
  if (a.reason && a.reason.length > MAX_REASON_CHARS) errs.push('reason-too-long');
  if (a.visitNotes && a.visitNotes.length > MAX_NOTES_CHARS) errs.push('notes-too-long');
  if (STATUSES.indexOf(a.status) === -1) errs.push('status-invalid');
  if (a.feeAtBooking !== null && a.feeAtBooking !== undefined && a.feeAtBooking !== '') {
    var fb = Number(a.feeAtBooking);
    if (isNaN(fb) || fb < 0 || fb > MAX_FEE) errs.push('fee-invalid');
  }
  if (a.status === 'completed') {
    if (a.feePaid !== null && a.feePaid !== undefined) {
      var fp = Number(a.feePaid);
      if (isNaN(fp) || fp < 0 || fp > MAX_FEE) errs.push('fee-invalid');
    }
  }
  if (!opts.allowPast && a.status === 'upcoming' && isValidDate(a.date) && isValidTime(a.time)) {
    var now = (typeof opts.nowMs === 'number') ? opts.nowMs : Date.now();
    if (appointmentMs(a) < now) errs.push('date-in-past');
  }
  return errs;
}

// ---------- lists / sorting ----------
function sortAppointments(list) {
  return list.slice().sort(function (a, b) {
    var ka = (a.date || '') + ' ' + (a.time || '');
    var kb = (b.date || '') + ' ' + (b.time || '');
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

function byStatus(list, status) {
  return list.filter(function (a) { return a.status === status; });
}

function upcomingAppointments(list) {
  return sortAppointments(byStatus(list, 'upcoming'));
}

function appointmentsOn(list, dateStr) {
  return sortAppointments(list.filter(function (a) { return a.date === dateStr; }));
}

function searchDoctors(list, q) {
  if (!q || !q.trim()) return list.slice();
  var needle = q.trim().toLowerCase();
  return list.filter(function (d) {
    var hay = [d.name, d.chamber, d.specialty, d.phone || ''].join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  });
}

function filterDoctorsBySpecialty(list, specialty) {
  if (!specialty || specialty === 'all') return list.slice();
  return list.filter(function (d) { return d.specialty === specialty; });
}

function sortDoctors(list) {
  return list.slice().sort(function (a, b) {
    return String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase());
  });
}

function doctorById(doctors, id) {
  for (var i = 0; i < doctors.length; i++) if (doctors[i].id === id) return doctors[i];
  return null;
}

function appointmentsForDoctor(list, doctorId) {
  return sortAppointments(list.filter(function (a) { return a.doctorId === doctorId; }));
}

// ---------- stats ----------
function stats(doctors, appointments, nowMs) {
  var upcoming = byStatus(appointments, 'upcoming');
  var completed = byStatus(appointments, 'completed');
  var cancelled = byStatus(appointments, 'cancelled');
  var feesPaid = 0;
  completed.forEach(function (a) {
    var f = Number(a.feePaid);
    if (!isNaN(f) && f > 0) feesPaid += f;
  });
  var overdue = upcoming.filter(function (a) { return isOverdue(a, nowMs); }).length;
  return {
    doctors: doctors.length,
    upcoming: upcoming.length,
    completed: completed.length,
    cancelled: cancelled.length,
    feesPaid: feesPaid,
    overdue: overdue
  };
}

// Complete an appointment: feePaid = the fee snapshotted at booking time.
function completeAppointment(appt) {
  var copy = JSON.parse(JSON.stringify(appt));
  copy.status = 'completed';
  copy.feePaid = (copy.feeAtBooking === null || copy.feeAtBooking === undefined || copy.feeAtBooking === '')
    ? null : Number(copy.feeAtBooking);
  return copy;
}

// ---------- import / export ----------
function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not-an-object' };
  if (obj.app !== APP_ID) return { ok: false, error: 'wrong-app' };
  if (obj.version !== APP_VERSION) return { ok: false, error: 'wrong-version' };
  if (!Array.isArray(obj.doctors)) return { ok: false, error: 'doctors-not-array' };
  if (!Array.isArray(obj.appointments)) return { ok: false, error: 'appointments-not-array' };
  if (obj.doctors.length > MAX_DOCTORS) return { ok: false, error: 'too-many-doctors' };
  if (obj.appointments.length > MAX_APPOINTMENTS) return { ok: false, error: 'too-many-appointments' };
  var ids = {};
  for (var i = 0; i < obj.doctors.length; i++) {
    var d = obj.doctors[i];
    if (!d || typeof d.id !== 'string' || !d.id) return { ok: false, error: 'doctor-' + i + '-no-id' };
    if (ids[d.id]) return { ok: false, error: 'duplicate-id' };
    ids[d.id] = true;
    var errs = validateDoctor(d);
    if (errs.length) return { ok: false, error: 'doctor-' + i + '-' + errs[0] };
  }
  for (var j = 0; j < obj.appointments.length; j++) {
    var a = obj.appointments[j];
    if (!a || typeof a.id !== 'string' || !a.id) return { ok: false, error: 'appointment-' + j + '-no-id' };
    if (ids[a.id]) return { ok: false, error: 'duplicate-id' };
    ids[a.id] = true;
    var aerrs = validateAppointment(a, obj.doctors, { allowPast: true, skipDoctorCheck: true });
    if (aerrs.length) return { ok: false, error: 'appointment-' + j + '-' + aerrs[0] };
  }
  return { ok: true, doctors: obj.doctors.length, appointments: obj.appointments.length };
}

function buildExport(doctors, appointments) {
  return {
    app: APP_ID, version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    doctors: doctors, appointments: appointments
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    APP_ID: APP_ID, APP_VERSION: APP_VERSION,
    SPECIALTIES: SPECIALTIES, DAYS: DAYS, STATUSES: STATUSES,
    MAX_NAME_CHARS: MAX_NAME_CHARS, MAX_CHAMBER_CHARS: MAX_CHAMBER_CHARS,
    MAX_FEE: MAX_FEE, MAX_REASON_CHARS: MAX_REASON_CHARS,
    MAX_NOTES_CHARS: MAX_NOTES_CHARS, MAX_DOCTORS: MAX_DOCTORS,
    MAX_APPOINTMENTS: MAX_APPOINTMENTS,
    uid: uid, blankDoctor: blankDoctor, blankAppointment: blankAppointment,
    pad2: pad2, isValidDate: isValidDate, isValidTime: isValidTime,
    localToday: localToday, addDays: addDays, daysUntil: daysUntil,
    appointmentMs: appointmentMs, isOverdue: isOverdue,
    bnDigits: bnDigits, localizeNumber: localizeNumber,
    groupThousands: groupThousands, formatFee: formatFee,
    validatePhone: validatePhone, validateDoctor: validateDoctor,
    validateAppointment: validateAppointment,
    sortAppointments: sortAppointments, byStatus: byStatus,
    upcomingAppointments: upcomingAppointments, appointmentsOn: appointmentsOn,
    searchDoctors: searchDoctors, filterDoctorsBySpecialty: filterDoctorsBySpecialty,
    sortDoctors: sortDoctors, doctorById: doctorById,
    appointmentsForDoctor: appointmentsForDoctor,
    stats: stats, completeAppointment: completeAppointment,
    validateImport: validateImport, buildExport: buildExport
  };
}
