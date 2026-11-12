/* Quran Sanad Update: single-page app talking to the Apps Script API (or the demo mock). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var API = window.SANAD_CONFIG.API_URL;
  var DEMO = !API || /[?&]demo\b/.test(location.search);
  var state = { token: null, user: null, boot: null, picked: [], records: [], level: "" };

  /* ---------- helpers ---------- */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(id) { var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), u = document.createElementNS(ns, "use"); s.setAttribute("class", "ic"); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#" + id); s.appendChild(u); return s; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function nice(iso) { if (!/^\d{4}-\d{2}-\d{2}/.test(iso || "")) return iso || "—"; var p = iso.split("-"); return +p[2] + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle("is-busy", on); }
  function alertBox(node, msg) { node.textContent = msg || ""; node.hidden = !msg; }
  var toastTimer;
  function toast(msg) { if ($("#app").hidden) return; var t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200); }

  function api(action, data) {
    var body = Object.assign({ action: action, token: state.token }, data || {});
    var call = DEMO ? window.SANAD_MOCK(body) : fetch(API, { method: "POST", body: JSON.stringify(body), redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error("Server error " + r.status); return r.json(); });
    return call.catch(function () { return { ok: false, error: "Can't reach the server. Check your connection and try again." }; })
      .then(function (res) {
        if (res.ok) return res;
        if (res.auth) { logout(true); }
        throw new Error(res.error || "Something went wrong.");
      });
  }

  function confirmDlg(title, text, yesLabel) {
    var d = $("#confirm-dlg");
    $("#confirm-title").textContent = title; $("#confirm-text").textContent = text; $("#confirm-yes").textContent = yesLabel;
    d.showModal(); $("#confirm-no").focus();
    return new Promise(function (resolve) {
      function done(v) { d.close(); $("#confirm-yes").onclick = $("#confirm-no").onclick = null; d.onclose = null; resolve(v); }
      $("#confirm-yes").onclick = function () { done(true); };
      $("#confirm-no").onclick = function () { done(false); };
      d.onclose = function () { resolve(false); };
    });
  }

  /* ---------- theme ---------- */
  $("#theme").addEventListener("click", function () {
    var t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("sanad-theme", t); } catch (e) {}
  });

  /* ---------- login ---------- */
  $("#demo-tag").hidden = !DEMO;
  $$(".seg [role=tab]").forEach(function (tab, i, all) {
    tab.addEventListener("click", function () {
      all.forEach(function (t) { var on = t === tab; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; $("#" + t.getAttribute("aria-controls")).hidden = !on; });
      alertBox($("#login-alert"));
      $("input", $("#" + tab.getAttribute("aria-controls"))).focus();
    });
    tab.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); all[1 - i].click(); } });
  });
  function doLogin(form, action, data) {
    var btn = $("button[type=submit]", form);
    alertBox($("#login-alert"));
    busy(btn, true);
    api(action, data).then(function (res) {
      state.token = res.token; state.user = res.user;
      store("sanad-session", JSON.stringify({ token: res.token, user: res.user }));
      form.reset(); start();
    }).catch(function (e) {
      alertBox($("#login-alert"), e.message);
      var card = $(".login-card"); card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    }).finally(function () { busy(btn, false); });
  }
  $("#form-teacher").addEventListener("submit", function (e) {
    e.preventDefault(); var id = $("#teacher-id").value.trim();
    if (!id) { alertBox($("#login-alert"), "Enter your Teacher ID."); $("#teacher-id").focus(); return; }
    doLogin(this, "login", { teacherId: id });
  });
  $("#form-admin").addEventListener("submit", function (e) {
    e.preventDefault(); var pw = $("#admin-pw").value;
    if (!pw) { alertBox($("#login-alert"), "Enter the admin password."); $("#admin-pw").focus(); return; }
    doLogin(this, "adminLogin", { password: pw });
  });

  function logout(expired) {
    state.token = state.user = state.boot = null;
    store("sanad-session", null);
    $("#app").hidden = true; $("#login").hidden = false;
    if (expired) alertBox($("#login-alert"), "Your session has ended. Please log in again.");
    $("#teacher-id").focus();
  }
  $("#logout").addEventListener("click", function () {
    confirmDlg("Log out?", "You'll need your Teacher ID to log in again.", "Log out").then(function (y) { if (y) { logout(); toast("Logged out."); } });
  });

  function start() {
    $("#login").hidden = true; $("#app").hidden = false;
    var admin = state.user.role === "admin";
    $$("[data-admin]").forEach(function (n) { n.hidden = !admin; });
    $("#who").textContent = admin ? "Admin" : state.user.name + " · " + state.user.id;
    loadBoot().then(function () { route(); });
  }

  /* ---------- routing ---------- */
  var TITLES = { dashboard: "Dashboard", entry: "New Sanad entry", records: "Records", admin: "Admin" };
  function route() {
    if (!state.user) return;
    var v = location.hash.slice(1) || "dashboard";
    if (!TITLES[v] || (v === "admin" && state.user.role !== "admin")) v = "dashboard";
    $$("[data-view]").forEach(function (s) { s.hidden = s.dataset.view !== v; });
    $$("[data-nav]").forEach(function (a) { if (a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#view-title").textContent = TITLES[v];
    document.title = TITLES[v] + " · Quran Sanad Update";
    ({ dashboard: renderDashboard, entry: function () {}, records: loadRecords, admin: loadAdmin })[v]();
    $("#main").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- bootstrap data ---------- */
  function loadBoot() {
    return api("bootstrap").then(function (b) {
      state.boot = b;
      $$("[data-year]").forEach(function (n) { n.textContent = b.year; });
      fillSelect($("#class-pick"), b.classes, "Choose a class");
      fillSelect($("#rec-class"), b.classes, "All classes");
      fillSelect($("#rec-level"), b.levels, "All levels");
      fillSelect($("#edit-level"), b.levels);
      buildLevelPick(b.levels);
    }).catch(function (e) { toast(e.message); });
  }
  function fillSelect(sel, items, first) {
    var keep = sel.value; sel.textContent = "";
    if (first !== undefined) { var o = el("option", null, first); o.value = ""; sel.appendChild(o); }
    items.forEach(function (i) { var o = el("option", null, i); o.value = i; sel.appendChild(o); });
    sel.value = keep;
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    var b = state.boot; if (!b) return;
    var s = $("#stats"); s.textContent = "";
    [["Students", b.stats.students, "i-users"], ["Sanad updated", b.stats.updated, "i-check"], ["Still to update", Math.max(0, b.stats.students - b.stats.updated), "i-history"], ["Teachers", b.stats.teachers, "i-cap"]]
      .forEach(function (x, i) {
        var c = el("div", "stat" + (i === 1 ? " good" : i === 2 ? " warn" : ""));
        var k = el("span", "k"); k.appendChild(icon(x[2])); k.appendChild(document.createTextNode(x[0]));
        c.appendChild(k); c.appendChild(el("b", null, String(x[1]))); s.appendChild(c);
      });
    var pct = b.stats.students ? Math.round(b.stats.updated / b.stats.students * 100) : 0;
    var bar = el("div", "progress"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuenow", pct); bar.setAttribute("aria-valuemin", 0); bar.setAttribute("aria-valuemax", 100); bar.setAttribute("aria-label", "Students updated this year");
    var fill = el("span"); bar.appendChild(fill); var lab = el("p", "muted small", pct + "% of students have a Sanad record for " + b.year + ".");
    var wrap = el("div", "progress-wrap"); wrap.appendChild(bar); wrap.appendChild(lab); s.appendChild(wrap);
    requestAnimationFrame(function () { fill.style.width = pct + "%"; });

    var L = $("#levels"); L.textContent = "";
    var max = Math.max.apply(null, b.levels.map(function (l) { return b.counts[l] || 0; }).concat(1));
    var total = 0;
    b.levels.forEach(function (l, i) {
      var n = b.counts[l] || 0; total += n;
      var row = el("a", "lvl" + (l === "Haafiz" ? " gold" : "")); row.href = "#records"; row.style.setProperty("--i", i);
      row.addEventListener("click", function () { $("#rec-level").value = l; });
      row.appendChild(el("span", "lvl-name", l));
      var t = el("span", "lvl-track"), f = el("span", "lvl-fill"); t.appendChild(f); row.appendChild(t);
      row.appendChild(el("span", "lvl-n", String(n)));
      row.setAttribute("aria-label", l + ": " + n + " students, show records");
      L.appendChild(row);
      requestAnimationFrame(function () { f.style.width = (n / max * 100) + "%"; });
    });
    $("#level-total").textContent = total + " students";
  }

  /* ---------- entry: step 1 find ---------- */
  function setStep(n) {
    $$(".steps li").forEach(function (li) { var k = +li.dataset.step; li.classList.toggle("current", k === n); li.classList.toggle("done", k < n); if (k === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current"); });
  }
  $("#class-pick").addEventListener("change", function () { if (this.value) { $("#its-input").value = ""; $("#find-form").requestSubmit(); } });
  $("#find-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var ids = $("#its-input").value.split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var cls = $("#class-pick").value;
    if (!ids.length && !cls) { alertBox($("#missing"), "Enter ITS numbers or choose a class."); $("#its-input").focus(); return; }
    if (ids.length) $("#class-pick").value = "";
    var btn = $("button[type=submit]", this); busy(btn, true); alertBox($("#missing"));
    api("students", ids.length ? { its: ids } : { cls: cls }).then(function (res) {
      state.picked = res.students;
      if (res.missing.length) alertBox($("#missing"), "Not found: " + res.missing.join(", ") + ". Check these ITS numbers.");
      renderPick(true);
    }).catch(function (err) { alertBox($("#missing"), err.message); }).finally(function () { busy(btn, false); });
  });
  function renderPick(checkAll) {
    var body = $("#pick-body"); body.textContent = "";
    state.picked.forEach(function (s) {
      var tr = el("tr"); tr.dataset.its = s.its;
      var td = el("td"), cb = el("input"); cb.type = "checkbox"; cb.checked = !!checkAll; cb.value = s.its; cb.setAttribute("aria-label", "Select " + s.name); td.appendChild(cb); tr.appendChild(td);
      tr.appendChild(el("td", "mono", s.its));
      tr.appendChild(el("td", "strong", s.name));
      tr.appendChild(el("td", null, s.cls)); tr.appendChild(el("td", null, s.roll || "—")); tr.appendChild(el("td", null, s.house || "—"));
      var lv = el("td"); lv.appendChild(s.level ? el("span", "chip" + (s.level === "Haafiz" ? " gold" : ""), s.level) : el("span", "chip empty", "Not set")); tr.appendChild(lv);
      tr.addEventListener("click", function (ev) { if (ev.target !== cb) { cb.checked = !cb.checked; } syncPick(); });
      body.appendChild(tr);
    });
    $("#pick").hidden = !state.picked.length;
    $("#pick-filter").value = "";
    syncPick();
    if (!state.picked.length) { $("#step-level").hidden = true; return; }
  }
  function selectedIts() { return $$("#pick-body input:checked").map(function (c) { return c.value; }); }
  function syncPick() {
    var all = $$("#pick-body input"), on = selectedIts();
    $$("#pick-body tr").forEach(function (tr) { tr.classList.toggle("on", $("input", tr).checked); });
    $("#pick-all").checked = all.length > 0 && on.length === all.length;
    $("#pick-all").indeterminate = on.length > 0 && on.length < all.length;
    $("#pick-count").textContent = on.length + " of " + all.length + " selected";
    $("#sel-n").textContent = on.length;
    $("#step-level").hidden = !on.length;
    setStep(on.length ? 2 : 1);
  }
  $("#pick-all").addEventListener("change", function () { var v = this.checked; $$("#pick-body tr").forEach(function (tr) { if (!tr.hidden) $("input", tr).checked = v; }); syncPick(); });
  $("#pick-filter").addEventListener("input", function () {
    var q = this.value.toLowerCase();
    $$("#pick-body tr").forEach(function (tr) { tr.hidden = q && tr.textContent.toLowerCase().indexOf(q) < 0; });
  });

  /* ---------- entry: step 2 level ---------- */
  function buildLevelPick(levels) {
    var box = $("#level-pick"); box.textContent = "";
    levels.forEach(function (l) {
      var lab = el("label", "lvl-opt" + (l === "Haafiz" ? " gold" : "")), r = el("input");
      r.type = "radio"; r.name = "level"; r.value = l; r.checked = state.level === l;
      r.addEventListener("change", function () { state.level = l; alertBox($("#save-alert")); });
      lab.appendChild(r); lab.appendChild(el("span", null, l)); box.appendChild(lab);
    });
  }
  $("#entry-date").value = today(); $("#entry-date").max = today();
  $("#save").addEventListener("click", function () {
    var ids = selectedIts(), date = $("#entry-date").value;
    if (!ids.length) return alertBox($("#save-alert"), "Select at least one student.");
    if (!state.level) { alertBox($("#save-alert"), "Choose a Quran level."); return $("#level-pick input").focus(); }
    if (!date || date > today()) { alertBox($("#save-alert"), "Choose a date that isn't in the future."); return $("#entry-date").focus(); }
    var btn = this; busy(btn, true); alertBox($("#save-alert"));
    api("saveSanad", { its: ids, level: state.level, date: date, remarks: $("#entry-remarks").value.trim() }).then(function (r) {
      $("#done-title").textContent = "Saved " + (r.added + r.updated) + (r.added + r.updated === 1 ? " student" : " students");
      $("#done-text").textContent = state.level + " · " + nice(date) + ". " + r.added + " new, " + r.updated + " updated" + (r.skipped ? ", " + r.skipped + " skipped" : "") + ".";
      $("#step-find").hidden = $("#step-level").hidden = true; $("#step-done").hidden = false; setStep(3);
      $("#step-done").focus();
      loadBoot();
    }).catch(function (e) { alertBox($("#save-alert"), e.message); }).finally(function () { busy(btn, false); });
  });
  $("#again").addEventListener("click", function () {
    state.picked = []; state.level = ""; renderPick(); $("#its-input").value = ""; $("#class-pick").value = ""; $("#entry-remarks").value = "";
    $$("#level-pick input").forEach(function (r) { r.checked = false; });
    $("#step-done").hidden = true; $("#step-find").hidden = false; setStep(1); $("#its-input").focus();
  });

  /* ---------- records ---------- */
  function loadRecords() {
    $("#rec-count").textContent = "Loading records…";
    var y = $("#rec-year").value === "current" ? state.boot && state.boot.year : "";
    return api("records", { year: y }).then(function (r) {
      // Most recently changed first, so an update shows at the top.
      state.records = r.records.sort(function (a, b) { return (b.updated || b.timestamp).localeCompare(a.updated || a.timestamp); });
      renderRecords();
    })
      .catch(function (e) { $("#rec-count").textContent = e.message; });
  }
  function filtered() {
    var q = $("#rec-q").value.trim().toLowerCase(), lv = $("#rec-level").value, cl = $("#rec-class").value;
    return state.records.filter(function (r) {
      return (!lv || r.level === lv) && (!cl || r.cls === cl) &&
        (!q || [r.its, r.name, r.teacherName, r.updatedBy, r.remarks].join(" ").toLowerCase().indexOf(q) >= 0);
    });
  }
  function renderRecords() {
    var list = filtered(), body = $("#rec-body"), admin = state.user.role === "admin";
    body.textContent = "";
    list.slice(0, 500).forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", "nowrap", nice(r.date)));
      var st = el("td"); st.appendChild(el("span", "strong block", r.name)); st.appendChild(el("span", "mono small muted", r.its)); tr.appendChild(st);
      tr.appendChild(el("td", "nowrap", r.cls)); tr.appendChild(el("td", null, r.house || "—"));
      var lv = el("td"); lv.appendChild(el("span", "chip" + (r.level === "Haafiz" ? " gold" : ""), r.level)); tr.appendChild(lv);
      tr.appendChild(el("td", "wrap", r.remarks || "—"));
      var by = el("td", "small"); by.appendChild(el("span", "block", r.updatedBy || r.teacherName)); if (r.updated) by.appendChild(el("span", "muted", r.updated)); tr.appendChild(by);
      var act = el("td", "row-actions");
      var eb = el("button", "icon-btn sm"); eb.type = "button"; eb.setAttribute("aria-label", "Edit record for " + r.name); eb.appendChild(icon("i-edit")); eb.addEventListener("click", function () { openEdit(r); }); act.appendChild(eb);
      if (admin) {
        var db = el("button", "icon-btn sm danger"); db.type = "button"; db.setAttribute("aria-label", "Delete record for " + r.name); db.appendChild(icon("i-trash"));
        db.addEventListener("click", function () {
          confirmDlg("Delete this record?", r.name + " · " + r.level + " · " + nice(r.date) + ". This removes the row from the sheet.", "Delete").then(function (y) {
            if (!y) return;
            api("deleteRecord", { row: r.row, its: r.its }).then(function () { toast("Record deleted."); loadRecords(); loadBoot(); }).catch(function (e) { toast(e.message); });
          });
        });
        act.appendChild(db);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
    if (!list.length) { var tr = el("tr"), td = el("td", "empty", state.records.length ? "No records match these filters." : "No records yet. Add one from New entry."); td.colSpan = 8; tr.appendChild(td); body.appendChild(tr); }
    $("#rec-count").textContent = "Showing " + Math.min(list.length, 500) + " of " + list.length + " records" + (list.length > 500 ? ". Narrow the search to see the rest." : ".");
  }
  ["rec-q", "rec-level", "rec-class"].forEach(function (id) { $("#" + id).addEventListener("input", function () { if (state.records.length) renderRecords(); }); });
  $("#rec-year").addEventListener("change", loadRecords);
  $("#rec-refresh").addEventListener("click", loadRecords);
  $("#rec-csv").addEventListener("click", function () {
    var list = filtered(); if (!list.length) return toast("Nothing to export.");
    var rows = [["Date", "ITS", "Student", "Class", "House", "Hijri Year", "Quran Level", "Remarks", "Teacher", "Last Updated", "Updated By"]]
      .concat(list.map(function (r) { return [r.date, r.its, r.name, r.cls, r.house, r.year, r.level, r.remarks, r.teacherName, r.updated, r.updatedBy]; }));
    var csv = rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? "" : c); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    var a = el("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "quran-sanad-" + today() + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  /* ---------- edit dialog ---------- */
  var editing = null;
  function openEdit(r) {
    editing = r;
    $("#edit-who").textContent = r.name + " · ITS " + r.its + " · " + r.cls;
    $("#edit-level").value = r.level; $("#edit-date").value = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : today(); $("#edit-date").max = today();
    $("#edit-remarks").value = r.remarks; alertBox($("#edit-alert"));
    $("#edit-dlg").showModal();
  }
  $("#edit-cancel").addEventListener("click", function () { $("#edit-dlg").close(); });
  $("#edit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("button[type=submit]", this), date = $("#edit-date").value;
    if (!date || date > today()) return alertBox($("#edit-alert"), "Choose a date that isn't in the future.");
    busy(btn, true);
    api("updateRecord", { row: editing.row, its: editing.its, level: $("#edit-level").value, date: date, remarks: $("#edit-remarks").value.trim() })
      .then(function () { $("#edit-dlg").close(); toast("Record updated."); loadRecords(); loadBoot(); })
      .catch(function (err) { alertBox($("#edit-alert"), err.message); }).finally(function () { busy(btn, false); });
  });

  /* ---------- admin ---------- */
  function loadAdmin() { loadTeachers(); loadAudit(); }
  function loadTeachers() {
    api("teachers").then(function (r) {
      var ul = $("#t-list"); ul.textContent = "";
      $("#t-count").textContent = r.teachers.length + " teachers";
      r.teachers.forEach(function (t) {
        var li = el("li"); var who = el("span"); who.appendChild(el("span", "strong block", t.name)); who.appendChild(el("span", "mono small muted", t.id)); li.appendChild(who);
        var b = el("button", "icon-btn sm danger"); b.type = "button"; b.setAttribute("aria-label", "Remove " + t.name); b.appendChild(icon("i-trash"));
        b.addEventListener("click", function () {
          confirmDlg("Remove " + t.name + "?", "They won't be able to log in. Their saved records stay in the sheet.", "Remove").then(function (y) {
            if (y) api("deleteTeacher", { id: t.id }).then(function () { toast("Teacher removed."); loadTeachers(); loadBoot(); }).catch(function (e) { toast(e.message); });
          });
        });
        li.appendChild(b); ul.appendChild(li);
      });
    }).catch(function (e) { toast(e.message); });
  }
  $("#teacher-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#t-name").value.trim(), id = $("#t-id").value.trim();
    if (!name || !id) return toast("Enter both name and Teacher ID.");
    var btn = $("button[type=submit]", this); busy(btn, true);
    api("addTeacher", { name: name, id: id }).then(function () { e.target.reset(); toast(name + " added."); loadTeachers(); loadBoot(); $("#t-name").focus(); })
      .catch(function (err) { toast(err.message); }).finally(function () { busy(btn, false); });
  });
  function loadAudit() {
    api("audit").then(function (r) {
      var ul = $("#audit"); ul.textContent = "";
      r.log.forEach(function (x) { var li = el("li"); li.appendChild(el("span", "small muted", x.time + " · " + x.user)); li.appendChild(el("span", null, x.action)); ul.appendChild(li); });
      if (!r.log.length) ul.appendChild(el("li", "muted", "No activity yet."));
    }).catch(function (e) { toast(e.message); });
  }
  $("#audit-refresh").addEventListener("click", loadAudit);

  /* ---------- boot ---------- */
  var saved = store("sanad-session");
  if (saved) { try { var s = JSON.parse(saved); state.token = s.token; state.user = s.user; start(); } catch (e) { store("sanad-session", null); } }
  if (!state.user) $("#teacher-id").focus();
})();
