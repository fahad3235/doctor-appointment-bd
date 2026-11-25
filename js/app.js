// Doctor Appointment BD \u2014 DOM layer. All UI text comes from STR (js/data.js);
// pure logic lives in js/logic.js and is shared with the Node tests.
'use strict';

var LS_DOCTORS = 'doctorApptBd.doctors.v1';
var LS_APPOINTMENTS = 'doctorApptBd.appointments.v1';
var LS_LANG = 'doctorApptBd.lang.v1';

var doctors = [];
var appointments = [];
var lang = 'en';
var currentTab = 'dashboard';
var editingDoctorId = null;
var editingApptId = null;
var storageOK = true;

function $(sel) { return document.querySelector(sel); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function t(key) {
  var s = (typeof STR !== 'undefined' && STR[lang] && STR[lang][key]) || (typeof STR !== 'undefined' && STR.en[key]) || key;
  return s;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtNum(n) { return localizeNumber(n, lang); }
function fmtDate(iso) {
  if (!iso) return '\u2014';
  return lang === 'bn' ? bnDigits(iso) : iso;
}
function fmtTime(hm) {
  if (!hm) return '\u2014';
  return lang === 'bn' ? bnDigits(hm) : hm;
}
function store(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { storageOK = false; }
}
function readStore(k) {
  try { return localStorage.getItem(k); } catch (e) { storageOK = false; return null; }
}
function specLabel(spec) {
  return t((typeof SPEC_KEY !== 'undefined' && SPEC_KEY[spec]) || 'specOther');
}
function dayLabel(day) {
  return t((typeof DAY_KEY !== 'undefined' && DAY_KEY[day]) || 'dayMon');
}

// ---------- i18n ----------
function applyI18n() {
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
  $('#lang-btn').textContent = lang === 'bn' ? 'English' : '\u09ac\u09be\u0982\u09b2\u09be';
}

// ---------- persistence ----------
function loadAll() {
  var rawD = readStore(LS_DOCTORS);
  doctors = [];
  if (rawD) {
    try {
      var pd = JSON.parse(rawD);
      if (Array.isArray(pd)) pd.forEach(function (d) { if (validateDoctor(d).length === 0) doctors.push(d); });
    } catch (e) { doctors = []; }
  }
  var rawA = readStore(LS_APPOINTMENTS);
  appointments = [];
  if (rawA) {
    try {
      var pa = JSON.parse(rawA);
      if (Array.isArray(pa)) {
        pa.forEach(function (a) {
          if (validateAppointment(a, doctors, { allowPast: true, skipDoctorCheck: true }).length === 0) appointments.push(a);
        });
      }
    } catch (e) { appointments = []; }
  }
  var l = readStore(LS_LANG);
  if (l === 'bn' || l === 'en') lang = l;
}
function persist() {
  store(LS_DOCTORS, JSON.stringify(doctors));
  store(LS_APPOINTMENTS, JSON.stringify(appointments));
  store(LS_LANG, lang);
}

// ---------- tabs ----------
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
  if (name === 'dashboard') renderDashboard();
  if (name === 'doctors') renderDoctors();
  if (name === 'appointments') renderAppointments();
  if (name === 'history') renderHistory();
}

// ---------- shared: appointment card ----------
function daysLabel(appt) {
  var n = daysUntil(appt.date);
  if (n === null) return '';
  if (n === 0) return t('daysToday');
  if (n === 1) return t('daysTomorrow');
  if (n > 1) return t('daysIn').replace('{n}', fmtNum(n));
  return t('daysAgo').replace('{n}', fmtNum(-n));
}

function statusLabel(status) {
  if (status === 'completed') return t('completedLabel');
  if (status === 'cancelled') return t('cancelledLabel');
  return t('upcomingLabel');
}

function doctorNameFor(appt) {
  var d = doctorById(doctors, appt.doctorId);
  return d ? d.name : (appt.doctorName || '\u2014');
}

function appointmentCard(appt, opts) {
  opts = opts || {};
  var card = el('article', 'appt-card');
  var doc = doctorById(doctors, appt.doctorId);
  var head = el('div', 'appt-head');
  head.appendChild(el('h3', null, doctorNameFor(appt)));
  var badge = el('span', 'status-badge ' + appt.status, statusLabel(appt.status));
  head.appendChild(badge);
  card.appendChild(head);
  if (doc) card.appendChild(el('p', 'card-sub', specLabel(doc.specialty) + ' \u00b7 ' + doc.chamber));
  card.appendChild(el('p', 'card-meta', fmtDate(appt.date) + ' \u00b7 ' + fmtTime(appt.time) + ' \u00b7 ' + daysLabel(appt)));
  card.appendChild(el('p', 'card-sub', appt.patient));
  if (appt.reason) card.appendChild(el('p', 'card-sub', appt.reason));
  var fee = appt.status === 'completed' ? appt.feePaid : appt.feeAtBooking;
  var feeText = formatFee(fee, lang);
  card.appendChild(el('p', 'card-meta', (appt.status === 'completed' ? t('feePaidLabel') : t('visitFee')) + ': ' + (feeText || t('noFeeSet'))));
  if (appt.status === 'upcoming' && isOverdue(appt)) {
    card.appendChild(el('p', 'overdue', t('overdueFlag')));
  }
  if (appt.status === 'completed' && opts.notes) {
    var notesWrap = el('div', 'notes-wrap');
    notesWrap.appendChild(el('label', 'field-label', t('visitNotes')));
    var ta = document.createElement('textarea');
    ta.rows = 3;
    ta.value = appt.visitNotes || '';
    ta.setAttribute('placeholder', t('notesPh'));
    ta.setAttribute('data-notes', appt.id);
    notesWrap.appendChild(ta);
    var saveBtn = el('button', 'btn', t('saveNotes'));
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', function () {
      var errs = [];
      if (ta.value.length > MAX_NOTES_CHARS) errs.push('notes-too-long');
      if (errs.length) { alert(errorMessage(errs[0])); return; }
      appt.visitNotes = ta.value;
      persist();
      saveBtn.textContent = t('notesSaved');
      setTimeout(function () { saveBtn.textContent = t('saveNotes'); }, 1500);
    });
    notesWrap.appendChild(saveBtn);
    card.appendChild(notesWrap);
  }
  var actions = el('div', 'card-actions');
  if (appt.status === 'upcoming') {
    var doneBtn = el('button', 'btn primary', t('markCompleted'));
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', function () {
      var idx = appointments.findIndex(function (x) { return x.id === appt.id; });
      if (idx < 0) return;
      appointments[idx] = completeAppointment(appointments[idx]);
      persist();
      renderAll();
    });
    var editBtn = el('button', 'btn', t('editBtn'));
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () { startEditAppointment(appt.id); });
    var cancelBtn = el('button', 'btn', t('cancelAppt'));
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', function () {
      if (!window.confirm(t('cancelApptConfirm'))) return;
      appt.status = 'cancelled';
      persist();
      renderAll();
    });
    actions.appendChild(doneBtn); actions.appendChild(editBtn); actions.appendChild(cancelBtn);
  }
  var delBtn = el('button', 'btn danger', t('deleteAppt'));
  delBtn.type = 'button';
  delBtn.addEventListener('click', function () {
    if (!window.confirm(t('delApptConfirm'))) return;
    appointments = appointments.filter(function (x) { return x.id !== appt.id; });
    persist();
    renderAll();
  });
  actions.appendChild(delBtn);
  card.appendChild(actions);
  return card;
}

function renderAll() {
  // Refresh every tab, not just the visible one, so hidden tabs never show
  // stale text after a language switch or a state change.
  renderDashboard();
  renderDoctors();
  renderAppointments();
  renderHistory();
}

// ---------- dashboard ----------
function renderDashboard() {
  var s = stats(doctors, appointments);
  var grid = $('#dash-stats');
  grid.innerHTML = '';
  var items = [
    [t('statUpcoming'), s.upcoming],
    [t('statCompleted'), s.completed],
    [t('statFeesPaid'), formatFee(s.feesPaid, lang) || 'Tk 0'],
    [t('statDoctors'), s.doctors],
    [t('statOverdue'), s.overdue]
  ];
  items.forEach(function (it) {
    var box = el('div', 'stat-box');
    box.appendChild(el('div', 'stat-num', fmtNum(it[1])));
    box.appendChild(el('div', 'stat-label', it[0]));
    grid.appendChild(box);
  });
  var today = localToday();
  var tomorrow = addDays(today, 1);
  var todayList = appointmentsOn(byStatus(appointments, 'upcoming'), today);
  var tomorrowList = appointmentsOn(byStatus(appointments, 'upcoming'), tomorrow);
  var upList = upcomingAppointments(appointments);
  fillList($('#today-list'), $('#today-empty'), todayList, {});
  fillList($('#tomorrow-list'), $('#tomorrow-empty'), tomorrowList, {});
  fillList($('#upcoming-list'), $('#upcoming-empty'), upList, {});
}
function fillList(wrap, emptyEl, list, opts) {
  emptyEl.hidden = list.length > 0;
  wrap.innerHTML = '';
  list.forEach(function (a) { wrap.appendChild(appointmentCard(a, opts)); });
}

// ---------- doctors ----------
function buildSpecialtyOptions(select, includeAll) {
  select.innerHTML = '';
  if (includeAll) {
    var all = document.createElement('option');
    all.value = 'all';
    all.textContent = t('filterAll');
    select.appendChild(all);
  }
  SPECIALTIES.forEach(function (sp) {
    var o = document.createElement('option');
    o.value = sp;
    o.textContent = specLabel(sp);
    select.appendChild(o);
  });
}

function buildDayCheckboxes() {
  var wrap = $('#doc-days');
  wrap.innerHTML = '';
  DAYS.forEach(function (day) {
    var lab = el('label', 'day-check');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.value = day;
    box.setAttribute('data-day', day);
    lab.appendChild(box);
    lab.appendChild(document.createTextNode(dayLabel(day)));
    wrap.appendChild(lab);
  });
}

function doctorFormValues() {
  var days = [];
  document.querySelectorAll('#doc-days input[type=checkbox]:checked').forEach(function (b) { days.push(b.value); });
  var feeRaw = $('#doc-fee').value.trim();
  return {
    name: $('#doc-name').value.trim(),
    specialty: $('#doc-specialty').value,
    chamber: $('#doc-chamber').value.trim(),
    phone: $('#doc-phone').value.trim(),
    fee: feeRaw === '' ? null : Number(feeRaw),
    days: days
  };
}

function setDoctorForm(d) {
  $('#doc-name').value = d ? d.name : '';
  $('#doc-specialty').value = d ? d.specialty : 'Medicine';
  $('#doc-chamber').value = d ? d.chamber : '';
  $('#doc-phone').value = d ? (d.phone || '') : '';
  $('#doc-fee').value = (d && d.fee !== null && d.fee !== undefined) ? String(d.fee) : '';
  document.querySelectorAll('#doc-days input[type=checkbox]').forEach(function (b) {
    b.checked = d ? d.days.indexOf(b.value) !== -1 : false;
  });
  $('#doctor-form-title').textContent = d ? t('editDoctor') : t('addDoctor');
  $('#doc-save-btn').textContent = t('saveDoctor');
  $('#doc-cancel-btn').hidden = !d;
  $('#doctor-errors').hidden = true;
}

function renderDoctors() {
  var f = $('#doc-filter');
  if (!f.value) f.value = 'all';
  var q = $('#doc-search').value || '';
  var list = sortDoctors(filterDoctorsBySpecialty(searchDoctors(doctors, q), f.value));
  $('#doc-empty').hidden = list.length > 0;
  var wrap = $('#doc-list');
  wrap.innerHTML = '';
  list.forEach(function (d) {
    var card = el('article', 'report-card');
    card.appendChild(el('h3', null, d.name));
    card.appendChild(el('p', 'card-sub', specLabel(d.specialty)));
    card.appendChild(el('p', 'card-sub', d.chamber));
    var metaParts = [];
    if (d.phone) metaParts.push(d.phone);
    var feeText = formatFee(d.fee, lang);
    metaParts.push(feeText || t('noFeeSet'));
    metaParts.push(d.days.map(dayLabel).join(', '));
    card.appendChild(el('p', 'card-meta', metaParts.join(' \u00b7 ')));
    var actions = el('div', 'card-actions');
    var bookBtn = el('button', 'btn primary', t('bookBtn'));
    bookBtn.type = 'button';
    bookBtn.addEventListener('click', function () {
      switchTab('appointments');
      $('#appt-doctor').value = d.id;
      $('#appt-date').focus();
    });
    var editBtn = el('button', 'btn', t('editBtn'));
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () {
      editingDoctorId = d.id;
      setDoctorForm(d);
      window.scrollTo(0, 0);
      $('#doc-name').focus();
    });
    var delBtn = el('button', 'btn danger', t('delBtn'));
    delBtn.type = 'button';
    delBtn.addEventListener('click', function () {
      if (!window.confirm(t('delDoctorConfirm'))) return;
      doctors = doctors.filter(function (x) { return x.id !== d.id; });
      if (editingDoctorId === d.id) { editingDoctorId = null; setDoctorForm(null); }
      persist();
      renderDoctors();
    });
    actions.appendChild(bookBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);
    card.appendChild(actions);
    wrap.appendChild(card);
  });
}

// ---------- appointments ----------
function buildDoctorSelect() {
  var sel = $('#appt-doctor');
  var prev = sel.value;
  sel.innerHTML = '';
  var ph = document.createElement('option');
  ph.value = '';
  ph.textContent = t('selectDoctor');
  sel.appendChild(ph);
  sortDoctors(doctors).forEach(function (d) {
    var o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name + ' \u2014 ' + specLabel(d.specialty);
    sel.appendChild(o);
  });
  if (prev && doctors.some(function (d) { return d.id === prev; })) sel.value = prev;
}

function apptFormValues() {
  return {
    doctorId: $('#appt-doctor').value,
    date: $('#appt-date').value,
    time: $('#appt-time').value,
    patient: $('#appt-patient').value.trim(),
    reason: $('#appt-reason').value.trim()
  };
}

function setApptForm(a) {
  buildDoctorSelect();
  $('#appt-doctor').value = a ? a.doctorId : '';
  $('#appt-doctor').disabled = !!a;
  $('#appt-date').value = a ? a.date : '';
  $('#appt-time').value = a ? a.time : '';
  $('#appt-patient').value = a ? a.patient : '';
  $('#appt-patient').disabled = !!a;
  $('#appt-reason').value = a ? (a.reason || '') : '';
  $('#appt-form-title').textContent = a ? t('editApptTitle') : t('bookTitle');
  $('#appt-submit-btn').textContent = a ? t('saveAppt') : t('bookSubmit');
  $('#appt-cancel-btn').hidden = !a;
  $('#appt-errors').hidden = true;
}

function startEditAppointment(id) {
  var a = null;
  appointments.forEach(function (x) { if (x.id === id) a = x; });
  if (!a) return;
  editingApptId = id;
  switchTab('appointments');
  setApptForm(a);
  window.scrollTo(0, 0);
  $('#appt-date').focus();
}

function renderAppointments() {
  buildDoctorSelect();
  var up = upcomingAppointments(appointments);
  var cancelled = sortAppointments(byStatus(appointments, 'cancelled'));
  fillList($('#appt-list'), $('#appt-empty'), up, {});
  $('#cancelled-empty').hidden = cancelled.length > 0;
  var wrap = $('#cancelled-list');
  wrap.innerHTML = '';
  cancelled.forEach(function (a) { wrap.appendChild(appointmentCard(a, {})); });
}

// ---------- history ----------
function renderHistory() {
  var docSel = $('#hist-doctor');
  var prevDoc = docSel.value;
  docSel.innerHTML = '';
  var allD = document.createElement('option');
  allD.value = 'all';
  allD.textContent = t('histFilterAll');
  docSel.appendChild(allD);
  sortDoctors(doctors).forEach(function (d) {
    var o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    docSel.appendChild(o);
  });
  if (prevDoc && (prevDoc === 'all' || doctors.some(function (d) { return d.id === prevDoc; }))) docSel.value = prevDoc;

  var stSel = $('#hist-status');
  var prevSt = stSel.value;
  stSel.innerHTML = '';
  [['all', t('histStatusAll')], ['completed', t('completedLabel')], ['cancelled', t('cancelledLabel')]].forEach(function (pair) {
    var o = document.createElement('option');
    o.value = pair[0];
    o.textContent = pair[1];
    stSel.appendChild(o);
  });
  if (prevSt) stSel.value = prevSt;

  var list = appointments.slice();
  if (docSel.value !== 'all') list = list.filter(function (a) { return a.doctorId === docSel.value; });
  if (stSel.value !== 'all') list = list.filter(function (a) { return a.status === stSel.value; });
  else list = list.filter(function (a) { return a.status !== 'upcoming'; });
  list = sortAppointments(list).reverse();
  fillList($('#hist-list'), $('#hist-empty'), list, { notes: true });
}

// ---------- error messages ----------
function errorMessage(code) {
  var map = {
    'name-required': 'errNameRequired', 'name-too-long': 'errNameLong',
    'specialty-invalid': 'errSpecialty', 'chamber-required': 'errChamberRequired',
    'chamber-too-long': 'errChamberLong', 'phone-invalid': 'errPhone',
    'fee-invalid': 'errFee', 'days-required': 'errDays', 'days-invalid': 'errDays',
    'doctor-required': 'errDoctorRequired', 'doctor-not-found': 'errDoctorMissing',
    'date-required': 'errDateRequired', 'date-invalid': 'errDateInvalid',
    'date-in-past': 'errDatePast', 'time-required': 'errTimeRequired',
    'time-invalid': 'errTimeInvalid', 'patient-required': 'errPatientRequired',
    'patient-too-long': 'errPatientLong', 'reason-too-long': 'errReasonLong',
    'notes-too-long': 'errNotesLong'
  };
  return t(map[code] || 'errGeneric');
}

// ---------- data tab ----------
function showDataMsg(msg, isError) {
  var n = $('#data-msg');
  n.textContent = msg;
  n.className = 'data-msg' + (isError ? ' error' : '');
}

function exportAll() {
  var json = JSON.stringify(buildExport(doctors, appointments), null, 2);
  window.__dabExport = json; // test hook for the smoke test
  var blob = new Blob([json], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'doctor-appointment-bd-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function importFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var obj;
    try { obj = JSON.parse(reader.result); } catch (e) { showDataMsg(t('importFail').replace('{e}', 'invalid JSON'), true); return; }
    var res = validateImport(obj);
    if (!res.ok) { showDataMsg(t('importFail').replace('{e}', res.error), true); return; }
    doctors = obj.doctors;
    appointments = obj.appointments;
    persist();
    showDataMsg(t('importOk').replace('{d}', fmtNum(res.doctors)).replace('{a}', fmtNum(res.appointments)), false);
    renderAll();
  };
  reader.readAsText(file);
}

// Rebuild language-dependent dynamic controls (select options, day labels)
// after a language switch, preserving the user's current selections.
function rebuildDynamicLabels() {
  var specVal = $('#doc-specialty').value;
  var filterVal = $('#doc-filter').value;
  buildSpecialtyOptions($('#doc-specialty'), false);
  buildSpecialtyOptions($('#doc-filter'), true);
  if (specVal) $('#doc-specialty').value = specVal;
  if (filterVal) $('#doc-filter').value = filterVal;
  var checked = [];
  document.querySelectorAll('#doc-days input[type=checkbox]:checked').forEach(function (b) { checked.push(b.value); });
  buildDayCheckboxes();
  document.querySelectorAll('#doc-days input[type=checkbox]').forEach(function (b) {
    b.checked = checked.indexOf(b.value) !== -1;
  });
  if (editingDoctorId) {
    var d = doctorById(doctors, editingDoctorId);
    if (d) $('#doctor-form-title').textContent = t('editDoctor');
  } else {
    $('#doctor-form-title').textContent = t('addDoctor');
  }
  if (editingApptId) $('#appt-form-title').textContent = t('editApptTitle');
  else $('#appt-form-title').textContent = t('bookTitle');
}

// ---------- init ----------
function init() {
  loadAll();
  applyI18n();
  buildSpecialtyOptions($('#doc-specialty'), false);
  buildSpecialtyOptions($('#doc-filter'), true);
  buildDayCheckboxes();
  setDoctorForm(null);
  setApptForm(null);
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });
  $('#lang-btn').addEventListener('click', function () {
    lang = lang === 'bn' ? 'en' : 'bn';
    persist();
    applyI18n();
    rebuildDynamicLabels();
    renderAll();
  });
  $('#doc-search').addEventListener('input', renderDoctors);
  $('#doc-filter').addEventListener('change', renderDoctors);
  $('#hist-doctor').addEventListener('change', renderHistory);
  $('#hist-status').addEventListener('change', renderHistory);

  $('#doctor-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = doctorFormValues();
    var errs = validateDoctor(v);
    var box = $('#doctor-errors');
    if (errs.length) {
      box.hidden = false;
      box.textContent = errs.slice(0, 3).map(errorMessage).join(' ');
      return;
    }
    box.hidden = true;
    if (editingDoctorId) {
      var d = doctorById(doctors, editingDoctorId);
      if (d) {
        d.name = v.name; d.specialty = v.specialty; d.chamber = v.chamber;
        d.phone = v.phone; d.fee = v.fee; d.days = v.days;
      }
      editingDoctorId = null;
    } else {
      var nd = blankDoctor();
      nd.name = v.name; nd.specialty = v.specialty; nd.chamber = v.chamber;
      nd.phone = v.phone; nd.fee = v.fee; nd.days = v.days;
      doctors.push(nd);
    }
    persist();
    setDoctorForm(null);
    renderDoctors();
  });
  $('#doc-cancel-btn').addEventListener('click', function () {
    editingDoctorId = null;
    setDoctorForm(null);
  });

  $('#appt-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = apptFormValues();
    var box = $('#appt-errors');
    if (editingApptId) {
      var cur = null;
      appointments.forEach(function (x) { if (x.id === editingApptId) cur = x; });
      if (!cur) { editingApptId = null; return; }
      var edited = JSON.parse(JSON.stringify(cur));
      edited.date = v.date; edited.time = v.time; edited.reason = v.reason;
      var errs = validateAppointment(edited, doctors, {});
      if (errs.length) {
        box.hidden = false;
        box.textContent = errs.slice(0, 3).map(errorMessage).join(' ');
        return;
      }
      box.hidden = true;
      cur.date = v.date; cur.time = v.time; cur.reason = v.reason;
      editingApptId = null;
      persist();
      setApptForm(null);
      renderAppointments();
      return;
    }
    var na = blankAppointment();
    na.doctorId = v.doctorId; na.date = v.date; na.time = v.time;
    na.patient = v.patient; na.reason = v.reason;
    var doc = doctorById(doctors, v.doctorId);
    na.doctorName = doc ? doc.name : '';
    na.feeAtBooking = doc ? doc.fee : null;
    var errs2 = validateAppointment(na, doctors, {});
    if (errs2.length) {
      box.hidden = false;
      box.textContent = errs2.slice(0, 3).map(errorMessage).join(' ');
      return;
    }
    box.hidden = true;
    appointments.push(na);
    persist();
    setApptForm(null);
    renderAppointments();
  });
  $('#appt-cancel-btn').addEventListener('click', function () {
    editingApptId = null;
    setApptForm(null);
  });

  $('#export-btn').addEventListener('click', exportAll);
  $('#import-btn').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#erase-btn').addEventListener('click', function () {
    var ans = window.prompt(t('eraseConfirm'));
    if (ans !== 'DELETE') return;
    doctors = [];
    appointments = [];
    editingDoctorId = null;
    editingApptId = null;
    persist();
    showDataMsg(t('eraseDone'), false);
    renderAll();
  });

  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
