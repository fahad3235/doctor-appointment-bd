// Headless-Chrome smoke test for Doctor Appointment BD.
// Drives the Playwright-cached headless_shell over CDP with Node's built-in
// WebSocket (no npm deps). Run from the project root:
//   node tests/smoke.mjs [1280|390]
// Exits 0 only if every check passes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell');
const PORT = 9233;
const WIDTH = parseInt(process.argv[2] || '1280', 10);
const HEIGHT = WIDTH <= 480 ? 844 : 800;
const URL = 'file://' + path.join(ROOT, 'index.html');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TOMORROW = isoDate(new Date(Date.now() + 86400000));
const DAY_AFTER = isoDate(new Date(Date.now() + 2 * 86400000));
const YESTERDAY = isoDate(new Date(Date.now() - 86400000));

async function waitFor(fn, timeout = 15000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('timeout waiting for ' + label);
}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=' + PORT,
  '--window-size=' + WIDTH + ',' + HEIGHT,
  'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      break;
    } catch { await sleep(250); }
  }
  if (!targets) throw new Error('DevTools endpoint never came up');

  const pageTarget = targets.find((t) => t.type === 'page');
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const failedReqs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Network.loadingFailed') {
      failedReqs.push(msg.params.errorText);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const setValQ = async (selector, value) => {
    await evalJs(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}`);
    await evalJs(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new Event("input", { bubbles: true }))`);
  };
  const clickTab = async (name) => {
    await evalJs(`[...document.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "${name}").click()`);
    await sleep(250);
  };
  const countDoctors = () => evalJs('(JSON.parse(localStorage.getItem("doctorApptBd.doctors.v1") || "[]")).length');
  const countAppts = () => evalJs('(JSON.parse(localStorage.getItem("doctorApptBd.appointments.v1") || "[]")).length');
  const noOverflow = () => evalJs('document.documentElement.scrollWidth <= window.innerWidth + 1');

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH <= 480 });
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'page load');
  await sleep(500);
  await evalJs('localStorage.clear()');
  await send('Page.navigate', { url: URL });
  await waitFor(async () => (await evalJs('document.readyState')) === 'complete', 15000, 'reload');
  await sleep(500);

  console.log(`smoke @ ${WIDTH}x${HEIGHT}: ${URL}`);
  check('page title', (await evalJs('document.title')).includes('Doctor Appointment BD'));
  check('app heading rendered', (await evalJs('document.querySelector("h1").textContent')) === 'Doctor Appointment BD');
  check('5 tabs rendered', (await evalJs('document.querySelectorAll(".tab-btn").length')) === 5);
  check('dashboard empty state shown', (await evalJs('document.getElementById("upcoming-empty").hidden')) === false);
  check('stats say 0 doctors', (await evalJs('document.getElementById("dash-stats").textContent')).includes('0'));
  check('no horizontal overflow on load', await noOverflow());
  check('no console errors on load', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests on load', failedReqs.length === 0, failedReqs.join(' | '));

  // ---- Doctors: validation rejects empty name ----
  await clickTab('doctors');
  check('doctors empty state shown', (await evalJs('document.getElementById("doc-empty").hidden')) === false);
  await evalJs('document.getElementById("doctor-form").requestSubmit()');
  await sleep(400);
  check('empty doctor form shows error', (await evalJs('document.getElementById("doctor-errors").hidden')) === false);
  check('empty doctor error text', (await evalJs('document.getElementById("doctor-errors").textContent')).includes('name is required'));
  check('still 0 doctors after rejected submit', (await countDoctors()) === 0);

  // ---- Add doctor 1 via the UI ----
  await setValQ('#doc-name', 'Dr. Ayesha Rahman');
  await evalJs('document.getElementById("doc-specialty").value = "Cardiology"');
  await setValQ('#doc-chamber', 'Square Hospital, Dhaka');
  await setValQ('#doc-phone', '+8801712345678');
  await setValQ('#doc-fee', '800');
  await evalJs('document.querySelector(\'#doc-days input[data-day="Sat"]\').click()');
  await evalJs('document.querySelector(\'#doc-days input[data-day="Mon"]\').click()');
  await evalJs('document.getElementById("doctor-form").requestSubmit()');
  await sleep(500);
  check('1 doctor stored', (await countDoctors()) === 1);
  check('doctor card lists name', (await evalJs('document.getElementById("doc-list").textContent')).includes('Dr. Ayesha Rahman'));
  check('doctor card shows fee Tk 800', (await evalJs('document.getElementById("doc-list").textContent')).includes('Tk 800'));
  check('doctor card shows chamber', (await evalJs('document.getElementById("doc-list").textContent')).includes('Square Hospital'));
  check('doctor card shows visiting days', (await evalJs('document.getElementById("doc-list").textContent')).includes('Sat'));
  check('doctor form cleared after save', (await evalJs('document.getElementById("doc-name").value')) === '');

  // ---- Appointments: past date rejected, then book for tomorrow ----
  await clickTab('appointments');
  await evalJs('document.getElementById("appt-doctor").value = JSON.parse(localStorage.getItem("doctorApptBd.doctors.v1"))[0].id');
  await setValQ('#appt-date', YESTERDAY);
  await setValQ('#appt-time', '10:00');
  await setValQ('#appt-patient', 'Rahim Uddin');
  await evalJs('document.getElementById("appt-form").requestSubmit()');
  await sleep(400);
  check('past appointment rejected', (await evalJs('document.getElementById("appt-errors").hidden')) === false);
  check('past error text', (await evalJs('document.getElementById("appt-errors").textContent')).includes('in the past'));
  check('still 0 appointments after rejected booking', (await countAppts()) === 0);
  await setValQ('#appt-date', TOMORROW);
  await evalJs('document.getElementById("appt-form").requestSubmit()');
  await sleep(500);
  check('1 appointment stored', (await countAppts()) === 1);
  check('upcoming list shows patient', (await evalJs('document.getElementById("appt-list").textContent')).includes('Rahim Uddin'));
  check('upcoming card shows Tomorrow days-until', (await evalJs('document.getElementById("appt-list").textContent')).includes('Tomorrow'));
  check('upcoming card shows fee Tk 800', (await evalJs('document.getElementById("appt-list").textContent')).includes('Tk 800'));

  // ---- Edit appointment time 10:00 -> 11:00 ----
  await evalJs('[...document.querySelectorAll("#appt-list .appt-card .btn")].find(b => b.textContent.trim() === "Edit").click()');
  await sleep(400);
  check('edit mode: doctor select disabled', (await evalJs('document.getElementById("appt-doctor").disabled')) === true);
  await setValQ('#appt-time', '11:00');
  await evalJs('document.getElementById("appt-form").requestSubmit()');
  await sleep(500);
  check('edited time shows 11:00', (await evalJs('document.getElementById("appt-list").textContent')).includes('11:00'));

  // ---- Dashboard: tomorrow section + stats ----
  await clickTab('dashboard');
  check('tomorrow section shows the appointment', (await evalJs('document.getElementById("tomorrow-list").textContent')).includes('Rahim Uddin'));
  check('stats show 1 upcoming', (await evalJs('document.getElementById("dash-stats").textContent')).includes('1'));

  // ---- Mark completed -> fees paid increases ----
  await evalJs('[...document.querySelectorAll("#tomorrow-list .appt-card .btn")].find(b => b.textContent.includes("Mark completed")).click()');
  await sleep(500);
  check('fees paid stat is Tk 800 after completion', (await evalJs('document.getElementById("dash-stats").textContent')).includes('Tk 800'));
  check('completed count is 1', (await evalJs('JSON.parse(localStorage.getItem("doctorApptBd.appointments.v1")).filter(a => a.status === "completed").length')) === 1);
  check('completed appointment records feePaid 800', (await evalJs('JSON.parse(localStorage.getItem("doctorApptBd.appointments.v1"))[0].feePaid')) === 800);

  // ---- History: visit notes ----
  await clickTab('history');
  check('history shows the completed visit', (await evalJs('document.getElementById("hist-list").textContent')).includes('Rahim Uddin'));
  check('visit notes field present', (await evalJs('document.querySelectorAll("#hist-list textarea").length')) === 1);
  await setValQ('#hist-list textarea', 'Prescribed rest and follow-up in 2 weeks.');
  await evalJs('[...document.querySelectorAll("#hist-list .btn")].find(b => b.textContent.includes("Save notes")).click()');
  await sleep(400);
  check('notes saved message', (await evalJs('[...document.querySelectorAll("#hist-list .btn")].find(b => b.textContent.includes("Notes")).textContent')).includes('Notes saved'));
  check('notes persisted', (await evalJs('JSON.parse(localStorage.getItem("doctorApptBd.appointments.v1"))[0].visitNotes')).includes('follow-up'));

  // ---- Book a second appointment, then cancel it ----
  await clickTab('appointments');
  await evalJs('document.getElementById("appt-doctor").value = JSON.parse(localStorage.getItem("doctorApptBd.doctors.v1"))[0].id');
  await setValQ('#appt-date', DAY_AFTER);
  await setValQ('#appt-time', '09:30');
  await setValQ('#appt-patient', 'Karim Hossain');
  await evalJs('document.getElementById("appt-form").requestSubmit()');
  await sleep(500);
  check('2 appointments stored', (await countAppts()) === 2);
  await evalJs('window.confirm = () => true');
  await evalJs('[...document.querySelectorAll("#appt-list .appt-card")].find(c => c.textContent.includes("Karim")).querySelectorAll(".btn")[2].click()');
  await sleep(500);
  check('cancelled list shows Karim', (await evalJs('document.getElementById("cancelled-list").textContent')).includes('Karim Hossain'));
  check('cancelled count is 1', (await evalJs('JSON.parse(localStorage.getItem("doctorApptBd.appointments.v1")).filter(a => a.status === "cancelled").length')) === 1);

  // ---- Doctors: add second doctor, search filters ----
  await clickTab('doctors');
  await setValQ('#doc-name', 'Dr. Second Opinion');
  await evalJs('document.getElementById("doc-specialty").value = "Medicine"');
  await setValQ('#doc-chamber', 'Popular Diagnostics');
  await evalJs('document.querySelector(\'#doc-days input[data-day="Fri"]\').click()');
  await evalJs('document.getElementById("doctor-form").requestSubmit()');
  await sleep(500);
  check('2 doctors stored', (await countDoctors()) === 2);
  await setValQ('#doc-search', 'second');
  await sleep(300);
  check('search "second" -> 1 card', (await evalJs('document.querySelectorAll("#doc-list .report-card").length')) === 1);
  await setValQ('#doc-search', 'zzz-no-match');
  await sleep(300);
  check('search no-match -> 0 cards', (await evalJs('document.querySelectorAll("#doc-list .report-card").length')) === 0);
  await setValQ('#doc-search', '');
  await sleep(300);
  await evalJs('document.getElementById("doc-filter").value = "Cardiology"');
  await evalJs('document.getElementById("doc-filter").dispatchEvent(new Event("change", { bubbles: true }))');
  await sleep(300);
  check('specialty filter Cardiology -> 1 card', (await evalJs('document.querySelectorAll("#doc-list .report-card").length')) === 1);
  await evalJs('document.getElementById("doc-filter").value = "all"');
  await evalJs('document.getElementById("doc-filter").dispatchEvent(new Event("change", { bubbles: true }))');
  await sleep(300);
  check('filter all -> 2 cards', (await evalJs('document.querySelectorAll("#doc-list .report-card").length')) === 2);

  // ---- Language toggle ----
  await evalJs('document.getElementById("lang-btn").click()');
  await sleep(400);
  check('BN tagline after toggle', (await evalJs('document.querySelector(".tagline").textContent')).includes('\u09a1\u09be\u0995\u09cd\u09a4\u09be\u09b0'));
  check('BN tab label', (await evalJs('document.querySelector(".tab-btn").textContent')).includes('\u09a1\u09cd\u09af\u09be\u09b6\u09ac\u09cb\u09b0\u09cd\u09a1'));
  check('BN stats use Bengali digits', (await evalJs('document.getElementById("dash-stats").textContent')).includes('\u09e8'));
  await evalJs('document.getElementById("lang-btn").click()');
  await sleep(400);
  check('back to EN tagline', (await evalJs('document.querySelector(".tagline").textContent')).includes('doctor visits'));

  // ---- Data tab: export JSON, erase guards ----
  await clickTab('data');
  check('export button present', (await evalJs('document.getElementById("export-btn").textContent')).includes('Export'));
  check('import button present', (await evalJs('document.getElementById("import-btn").textContent')).includes('Import'));
  await evalJs('document.getElementById("export-btn").click()');
  await sleep(400);
  const expJson = await evalJs('window.__dabExport');
  let expOk = false, expCounts = '';
  try {
    const obj = JSON.parse(expJson);
    expOk = obj.app === 'doctor-appointment-bd' && obj.version === 1;
    expCounts = obj.doctors.length + '/' + obj.appointments.length;
  } catch { /* leave false */ }
  check('export produces valid JSON for this app', expOk, expCounts);
  check('export contains 2 doctors and 2 appointments', expCounts === '2/2', expCounts);
  await evalJs('window.prompt = () => "no"');
  await evalJs('document.getElementById("erase-btn").click()');
  await sleep(400);
  check('wrong erase text keeps data', (await countDoctors()) === 2);
  await evalJs('window.prompt = () => "DELETE"');
  await evalJs('document.getElementById("erase-btn").click()');
  await sleep(400);
  check('DELETE erases doctors', (await countDoctors()) === 0);
  check('DELETE erases appointments', (await countAppts()) === 0);
  check('erase message shown', (await evalJs('document.getElementById("data-msg").textContent')).length > 0);
  await clickTab('dashboard');
  check('dashboard empty again after erase', (await evalJs('document.getElementById("upcoming-empty").hidden')) === false);

  check('no horizontal overflow at end', await noOverflow());
  check('no console errors at end', consoleErrors.length === 0, consoleErrors.join(' | '));
  check('no failed requests at end', failedReqs.length === 0, failedReqs.join(' | '));

  // Screenshot for the record.
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) fs.writeFileSync(path.join(ROOT, 'tests', `smoke-${WIDTH}.png`), Buffer.from(shot.result.data, 'base64'));
} catch (e) {
  console.log('  FAIL harness :: ' + (e && e.message));
  fail++;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}

console.log(`\nsmoke @ ${WIDTH}: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
