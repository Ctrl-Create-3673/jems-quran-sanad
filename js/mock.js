/* Demo backend: the same actions as apps-script/Code.gs, kept in this browser. Loaded only when there is no API_URL or ?demo is set. */
(function () {
  "use strict";
  var YEAR = "1447/48";
  var LEVELS = ["Haafiz", "Surah Balad", "Surah Inshiqaq", "Marhala-1 (30)", "Marhala-2 (29-28)", "Marhala-3 (27-26)",
    "Marhala-4 (1-5)", "Marhala-5 (6-10)", "Marhala-6 (11-15)", "Marhala-7 (16-20)", "Marhala-8 (21-25)"];
  var houses = ["Burhani", "Mohammedi", "Taheri", "Saifee"];
  var classes = ["Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
  var students = [];
  classes.forEach(function (c, ci) {
    for (var i = 1; i <= 8; i++) students.push({ its: String(30400000 + ci * 100 + i), name: "Sample Student " + c.slice(-1) + "-" + i, cls: c, roll: String(i), house: houses[(i + ci) % 4], gender: i % 2 ? "Male" : "Female" });
  });
  var KEY = "sanad-demo-v1";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  var db = load() || { teachers: [{ name: "Demo Teacher", id: "T001" }, { name: "Hifz Teacher", id: "T002" }], records: [], log: [] };
  if (!db.records.length) {
    students.slice(0, 18).forEach(function (s, i) {
      db.records.push({ its: s.its, name: s.name, cls: s.cls, house: s.house, date: "2026-10-" + String(10 + (i % 18)).padStart(2, "0"), year: YEAR,
        level: LEVELS[3 + (i % 5)], remarks: "", teacherName: "Hifz Teacher", teacherId: "T002", timestamp: "2026-10-20 09:00", updated: "", updatedBy: "" });
    });
    save(db);
  }
  // Sessions survive a reload, like the real backend's 6-hour cache.
  var sessions = (function () { try { return JSON.parse(sessionStorage.getItem("sanad-demo-sessions")) || {}; } catch (e) { return {}; } })();
  function keep() { try { sessionStorage.setItem("sanad-demo-sessions", JSON.stringify(sessions)); } catch (e) {} }
  function now() { var d = new Date(); return d.toISOString().slice(0, 16).replace("T", " "); }
  function log(u, a) { db.log.push({ time: now(), user: u, action: a }); }
  function fail(msg, auth) { var e = new Error(msg); e.auth = auth; throw e; }
  function need(token, admin) { var u = sessions[token]; if (!u) fail("Your session has ended. Please log in again.", true); if (admin && u.role !== "admin") fail("Only an admin can do this."); return u; }
  function withRows() { return db.records.map(function (r, i) { return Object.assign({ row: i + 2 }, r); }); }

  var A = {
    login: function (q) { var t = db.teachers.find(function (x) { return x.id === String(q.teacherId || "").trim(); }); if (!t) fail("Teacher ID not found."); var tok = Math.random().toString(36).slice(2); sessions[tok] = { role: "teacher", name: t.name, id: t.id }; keep(); return { token: tok, user: sessions[tok] }; },
    adminLogin: function (q) { if (q.password !== "demo") fail("Wrong admin password."); var tok = Math.random().toString(36).slice(2); sessions[tok] = { role: "admin", name: "Admin", id: "ADMIN" }; keep(); return { token: tok, user: sessions[tok] }; },
    bootstrap: function () {
      var latest = {}; db.records.filter(function (r) { return r.year === YEAR; }).forEach(function (r) { latest[r.its] = r; });
      var counts = {}; db.records.filter(function (r) { return r.year === YEAR; }).forEach(function (r) { counts[r.level] = (counts[r.level] || 0) + 1; });
      return { year: YEAR, levels: LEVELS, classes: classes, counts: counts, stats: { students: students.length, teachers: db.teachers.length, updated: Object.keys(latest).length, entries: db.records.length } };
    },
    students: function (q) {
      var ids = (q.its || []).map(String);
      var list = ids.length ? students.filter(function (s) { return ids.indexOf(s.its) >= 0; }) : q.cls ? students.filter(function (s) { return s.cls === q.cls; }) : students;
      var latest = {}; db.records.forEach(function (r) { if (r.year === YEAR) latest[r.its] = r; });
      return { students: list.map(function (s) { return Object.assign({}, s, { level: latest[s.its] ? latest[s.its].level : "", lastDate: latest[s.its] ? latest[s.its].date : "" }); }),
        missing: ids.filter(function (id) { return !students.some(function (s) { return s.its === id; }); }) };
    },
    saveSanad: function (q, u) {
      if (LEVELS.indexOf(q.level) < 0) fail("Choose a valid Quran level.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date || "")) fail("Choose a valid date.");
      var added = 0, updated = 0;
      (q.its || []).forEach(function (its) {
        var s = students.find(function (x) { return x.its === its; }); if (!s) return;
        var r = db.records.filter(function (x) { return x.its === its && x.year === YEAR; }).pop();
        if (r) { Object.assign(r, { cls: s.cls, house: s.house, date: q.date, level: q.level, remarks: q.remarks || "", updated: now(), updatedBy: u.name }); updated++; }
        else { db.records.push({ its: its, name: s.name, cls: s.cls, house: s.house, date: q.date, year: YEAR, level: q.level, remarks: q.remarks || "", teacherName: u.name, teacherId: u.id, timestamp: now(), updated: now(), updatedBy: u.name }); added++; }
      });
      log(u.name, "Sanad " + q.level + ": " + added + " added, " + updated + " updated");
      return { added: added, updated: updated, skipped: (q.its || []).length - added - updated };
    },
    records: function (q) { var l = withRows(); if (q.year) l = l.filter(function (r) { return r.year === q.year; }); return { records: l.reverse() }; },
    updateRecord: function (q, u) {
      var r = db.records[q.row - 2]; if (!r || r.its !== q.its) fail("This record has changed. Refresh and try again.");
      if (LEVELS.indexOf(q.level) < 0) fail("Choose a valid Quran level.");
      Object.assign(r, { level: q.level, date: q.date, remarks: q.remarks || "", updated: now(), updatedBy: u.name }); log(u.name, "Edited record for " + q.its + " → " + q.level); return {};
    },
    deleteRecord: function (q) { var r = db.records[q.row - 2]; if (!r || r.its !== q.its) fail("This record has changed. Refresh and try again."); db.records.splice(q.row - 2, 1); log("Admin", "Deleted record for " + q.its); return {}; },
    teachers: function () { return { teachers: db.teachers }; },
    addTeacher: function (q) { if (!q.name || !q.id) fail("Enter both name and Teacher ID."); if (db.teachers.some(function (t) { return t.id === q.id; })) fail("That Teacher ID already exists."); db.teachers.push({ name: q.name, id: q.id }); log("Admin", "Added teacher " + q.name); return {}; },
    deleteTeacher: function (q) { db.teachers = db.teachers.filter(function (t) { return t.id !== q.id; }); log("Admin", "Deleted teacher " + q.id); return {}; },
    audit: function () { return { log: db.log.slice(-100).reverse() }; }
  };
  var PUBLIC = { login: 1, adminLogin: 1 }, ADMIN = { deleteRecord: 1, teachers: 1, addTeacher: 1, deleteTeacher: 1, audit: 1 };

  window.SANAD_MOCK = function (req) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        try {
          var u = PUBLIC[req.action] ? null : need(req.token, ADMIN[req.action]);
          var out = A[req.action](req, u); save(db);
          resolve(Object.assign({ ok: true }, out));
        } catch (e) { resolve({ ok: false, error: e.message, auth: !!e.auth }); }
      }, 350);
    });
  };
})();
