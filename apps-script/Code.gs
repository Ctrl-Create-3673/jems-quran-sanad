/************************************************
 QURAN SANAD UPDATE 2026/27 — JSON API (Code.gs)
 Frontend: GitHub Pages (index.html) calls this web app with fetch().

 One-time setup:
 1. Project Settings → Script Properties → add ADMIN_PASSWORD.
 2. Run setupSheets() once (formats sheets, adds level dropdown).
 3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
************************************************/

const HIJRI_YEAR = "1447/48";
const SESSION_HOURS = 6;

const LEVELS = [
  "Haafiz", "Surah Balad", "Surah Inshiqaq",
  "Marhala-1 (30)", "Marhala-2 (29-28)", "Marhala-3 (27-26)", "Marhala-4 (1-5)",
  "Marhala-5 (6-10)", "Marhala-6 (11-15)", "Marhala-7 (16-20)", "Marhala-8 (21-25)"
];

// Columns A–K keep the original order so existing pivot tables still work; L–M are new.
const RECORD_HEADERS = ["Timestamp", "Teacher Name", "Teacher ID", "Student ITS", "Student Name",
  "Class", "House", "Date", "Hijri Year", "Quran Level", "Remarks", "Last Updated", "Updated By"];
const C = { ts: 0, tName: 1, tId: 2, its: 3, name: 4, cls: 5, house: 6, date: 7, year: 8, level: 9, remarks: 10, updated: 11, updatedBy: 12 };

/************************************************
 HTTP
************************************************/

function doGet() {
  return json({ ok: true, app: "Quran Sanad API", year: HIJRI_YEAR });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "Bad request." }); }
  try {
    const handler = ACTIONS[req.action];
    if (!handler) return json({ ok: false, error: "Unknown action." });
    const user = handler.public ? null : requireSession(req.token, handler.admin);
    return json(Object.assign({ ok: true }, handler.run(req, user)));
  } catch (err) {
    return json({ ok: false, error: err.message, auth: err.auth === true });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/************************************************
 SESSIONS
************************************************/

function newSession(user) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("s:" + token, JSON.stringify(user), SESSION_HOURS * 3600);
  return token;
}

function requireSession(token, adminOnly) {
  const raw = token && CacheService.getScriptCache().get("s:" + token);
  if (!raw) { const e = new Error("Your session has ended. Please log in again."); e.auth = true; throw e; }
  const user = JSON.parse(raw);
  if (adminOnly && user.role !== "admin") throw new Error("Only an admin can do this.");
  return user;
}

/************************************************
 SHEET HELPERS
************************************************/

function sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found.');
  return sh;
}

function recordsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("Quran Sanad Records");
  if (!sh) { sh = ss.insertSheet("Quran Sanad Records"); sh.appendRow(RECORD_HEADERS); }
  return sh;
}

function iso(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(d || "");
}

function stamp(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(d || "");
}

function readStudents() {
  const data = sheet("Student Name").getDataRange().getValues();
  const h = data[0].map(x => String(x).trim());
  const col = (name, fallback) => (h.indexOf(name) >= 0 ? h.indexOf(name) : fallback);
  const c = { cls: col("Class", 0), name: col("Full Name", 1), gender: col("Gender", 2), its: col("Its Number", 6),
    roll: col("Roll number", 5), house: col("House", 7) };
  return data.slice(1).filter(r => String(r[c.its]).trim()).map(r => ({
    its: String(r[c.its]).trim(), name: String(r[c.name] || ""), cls: String(r[c.cls] || ""),
    roll: String(r[c.roll] || ""), house: String(r[c.house] || ""), gender: String(r[c.gender] || "")
  }));
}

function readRecords() {
  const data = recordsSheet().getDataRange().getValues();
  return data.slice(1).map((r, i) => ({
    row: i + 2, timestamp: stamp(r[C.ts]), teacherName: String(r[C.tName] || ""), teacherId: String(r[C.tId] || ""),
    its: String(r[C.its]).trim(), name: String(r[C.name] || ""), cls: String(r[C.cls] || ""), house: String(r[C.house] || ""),
    date: iso(r[C.date]), year: String(r[C.year] || ""), level: String(r[C.level] || ""), remarks: String(r[C.remarks] || ""),
    updated: stamp(r[C.updated]), updatedBy: String(r[C.updatedBy] || "")
  })).filter(r => r.its);
}

function log(user, action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("Audit Log");
  if (!sh) { sh = ss.insertSheet("Audit Log"); sh.appendRow(["Timestamp", "User", "Action"]); }
  sh.appendRow([new Date(), user, action]);
}

function clean(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 300); }

/************************************************
 ACTIONS
************************************************/

const ACTIONS = {
  login: { public: true, run: function (req) {
    const id = clean(req.teacherId, 50);
    if (!id) throw new Error("Enter your Teacher ID.");
    const rows = sheet("Teacher Data").getDataRange().getValues();
    const t = rows.slice(1).find(r => String(r[1]).trim() === id);
    if (!t) throw new Error("Teacher ID not found.");
    const user = { role: "teacher", name: String(t[0]), id: id };
    log(user.name, "Logged in");
    return { token: newSession(user), user: user };
  } },

  adminLogin: { public: true, run: function (req) {
    const pw = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
    if (!pw) throw new Error("Admin password is not set. Add ADMIN_PASSWORD in Script Properties.");
    Utilities.sleep(400); // slows password guessing
    if (String(req.password || "") !== pw) throw new Error("Wrong admin password.");
    const user = { role: "admin", name: "Admin", id: "ADMIN" };
    log("Admin", "Logged in");
    return { token: newSession(user), user: user };
  } },

  bootstrap: { run: function () {
    const students = readStudents();
    const records = readRecords().filter(r => r.year === HIJRI_YEAR);
    const latest = {};
    records.forEach(r => { latest[r.its] = r; }); // later rows win
    // Level chart counts every entry (repeat entries included) so it matches the sheet's row count.
    const counts = {};
    records.forEach(r => { counts[r.level] = (counts[r.level] || 0) + 1; });
    const classes = Array.from(new Set(students.map(s => s.cls).filter(Boolean))).sort();
    const teachers = Math.max(0, sheet("Teacher Data").getLastRow() - 1);
    return { year: HIJRI_YEAR, levels: LEVELS, classes: classes, counts: counts,
      stats: { students: students.length, teachers: teachers, updated: Object.keys(latest).length, entries: records.length } };
  } },

  students: { run: function (req) {
    const all = readStudents();
    const ids = (req.its || []).map(x => clean(x, 20)).filter(Boolean);
    const list = ids.length ? all.filter(s => ids.indexOf(s.its) >= 0) : req.cls ? all.filter(s => s.cls === req.cls) : all;
    const latest = {};
    readRecords().filter(r => r.year === HIJRI_YEAR).forEach(r => { latest[r.its] = r; });
    const found = list.map(s => Object.assign({}, s, { level: latest[s.its] ? latest[s.its].level : "", lastDate: latest[s.its] ? latest[s.its].date : "" }));
    const missing = ids.filter(id => !all.some(s => s.its === id));
    return { students: found, missing: missing };
  } },

  saveSanad: { run: function (req, user) {
    const level = clean(req.level, 60), date = clean(req.date, 10), remarks = clean(req.remarks, 300);
    if (LEVELS.indexOf(level) < 0) throw new Error("Choose a valid Quran level.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.");
    const ids = (req.its || []).map(x => clean(x, 20)).filter(Boolean);
    if (!ids.length) throw new Error("Select at least one student.");

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = recordsSheet();
      const students = {}; readStudents().forEach(s => { students[s.its] = s; });
      const rowOf = {}; readRecords().forEach(r => { if (r.year === HIJRI_YEAR) rowOf[r.its] = r.row; });
      const now = new Date();
      let added = 0, updated = 0;
      const appends = [];
      ids.forEach(its => {
        const s = students[its];
        if (!s) return;
        if (rowOf[its]) {
          // One row per student per year: update in place, keep the original timestamp and teacher.
          sh.getRange(rowOf[its], C.cls + 1, 1, 3).setValues([[s.cls, s.house, date]]);
          sh.getRange(rowOf[its], C.level + 1, 1, 4).setValues([[level, remarks, now, user.name]]);
          updated++;
        } else {
          appends.push([now, user.name, user.id, its, s.name, s.cls, s.house, date, HIJRI_YEAR, level, remarks, now, user.name]);
          added++;
        }
      });
      if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, RECORD_HEADERS.length).setValues(appends);
      log(user.name, "Sanad " + level + ": " + added + " added, " + updated + " updated");
      return { added: added, updated: updated, skipped: ids.length - added - updated };
    } finally { lock.releaseLock(); }
  } },

  records: { run: function (req, user) {
    let list = readRecords();
    if (req.year) list = list.filter(r => r.year === req.year);
    return { records: list.reverse() };
  } },

  updateRecord: { run: function (req, user) {
    const level = clean(req.level, 60), date = clean(req.date, 10), remarks = clean(req.remarks, 300);
    if (LEVELS.indexOf(level) < 0) throw new Error("Choose a valid Quran level.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid date.");
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = recordsSheet(), row = Number(req.row);
      // Guard against row shifts: the row must still hold this student.
      if (!(row >= 2) || String(sh.getRange(row, C.its + 1).getValue()).trim() !== clean(req.its, 20)) throw new Error("This record has changed. Refresh and try again.");
      sh.getRange(row, C.date + 1).setValue(date);
      sh.getRange(row, C.level + 1, 1, 4).setValues([[level, remarks, new Date(), user.name]]);
      log(user.name, "Edited record for " + req.its + " → " + level);
      return {};
    } finally { lock.releaseLock(); }
  } },

  deleteRecord: { admin: true, run: function (req, user) {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sh = recordsSheet(), row = Number(req.row);
      if (!(row >= 2) || String(sh.getRange(row, C.its + 1).getValue()).trim() !== clean(req.its, 20)) throw new Error("This record has changed. Refresh and try again.");
      const level = sh.getRange(row, C.level + 1).getValue();
      sh.deleteRow(row);
      log("Admin", "Deleted record for " + req.its + " (" + level + ")");
      return {};
    } finally { lock.releaseLock(); }
  } },

  teachers: { admin: true, run: function () {
    return { teachers: sheet("Teacher Data").getDataRange().getValues().slice(1).filter(r => r[1] !== "").map(r => ({ name: String(r[0]), id: String(r[1]) })) };
  } },

  addTeacher: { admin: true, run: function (req) {
    const name = clean(req.name, 80), id = clean(req.id, 50);
    if (!name || !id) throw new Error("Enter both name and Teacher ID.");
    const sh = sheet("Teacher Data");
    if (sh.getDataRange().getValues().slice(1).some(r => String(r[1]).trim() === id)) throw new Error("That Teacher ID already exists.");
    sh.appendRow([name, id]);
    log("Admin", "Added teacher " + name + " (" + id + ")");
    return {};
  } },

  deleteTeacher: { admin: true, run: function (req) {
    const sh = sheet("Teacher Data"), id = clean(req.id, 50);
    const rows = sh.getDataRange().getValues();
    const i = rows.findIndex((r, k) => k > 0 && String(r[1]).trim() === id);
    if (i < 0) throw new Error("Teacher ID not found.");
    sh.deleteRow(i + 1);
    log("Admin", "Deleted teacher " + rows[i][0] + " (" + id + ")");
    return {};
  } },

  audit: { admin: true, run: function () {
    const rows = sheet("Audit Log").getDataRange().getValues().slice(1).slice(-100).reverse();
    return { log: rows.map(r => ({ time: stamp(r[0]), user: String(r[1]), action: String(r[2]) })) };
  } }
};

/************************************************
 ONE-TIME SETUP: run from the editor to organise the sheets.
************************************************/

function setupSheets() {
  const sh = recordsSheet();
  sh.getRange(1, 1, 1, RECORD_HEADERS.length).setValues([RECORD_HEADERS])
    .setFontWeight("bold").setBackground("#1e3567").setFontColor("#ffffff");
  sh.setFrozenRows(1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(LEVELS, true).setAllowInvalid(false).build();
  sh.getRange(2, C.level + 1, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  sh.getRange(2, C.date + 1, sh.getMaxRows() - 1, 1).setNumberFormat("yyyy-mm-dd");
  sh.getRange(2, C.ts + 1, sh.getMaxRows() - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm");
  sh.getRange(2, C.updated + 1, sh.getMaxRows() - 1, 1).setNumberFormat("yyyy-mm-dd hh:mm");
  sh.autoResizeColumns(1, RECORD_HEADERS.length);
  ["Teacher Data", "Student Name", "Audit Log"].forEach(n => {
    const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n);
    if (s) { s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn() || 1).setFontWeight("bold"); }
  });
}

/************************************************
 SELF-CHECK: run from the editor; throws if the sheets don't match the code.
************************************************/

function selfCheck() {
  const students = readStudents();
  if (!students.length) throw new Error("No students read from 'Student Name' — check the 'Its Number' header.");
  if (sheet("Teacher Data").getLastRow() < 2) throw new Error("'Teacher Data' has no teachers.");
  const r = ACTIONS.bootstrap.run({});
  Logger.log("OK: %s students, %s teachers, %s updated this year", r.stats.students, r.stats.teachers, r.stats.updated);
}
