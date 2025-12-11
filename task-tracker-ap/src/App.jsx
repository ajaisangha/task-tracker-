import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import "./App.css";

// ===============================
// CONSTANTS
// ===============================
const ADMIN_IDS = [
  "ajaypal.sangha",
  "abin.thomas",
  "camilo.torres",
  "ishant.pruthi",
  "hardik.rana",
  "sunny.au-yeung",
  "arjaree.leenaungkoonruji",
];

const ADMIN_PASSWORD = "voila2026";
const ADMIN_SALT = "Ajaipal"; // for reference

// MD5("voila2026Ajaipal") = 96682ce68e5a064a34db9283597a27d0
// We just validate the plain password for this app.

const DEPARTMENT_ORDER = [
  "Others",
  "Tote Wash",
  "Pick",
  "Bagging",
  "Decant",
  "Freezer",
  "Dispatch",
  "IC",
];

const DEPARTMENTS = {
  Others: ["Shift End", "Washroom", "Break", "Move To Another Department"],
  "Tote Wash": ["Tote Wash", "Tote Wash Cleanup", "Move Pallets"],
  Pick: [
    "Ambient Picking",
    "Ambient Pick Cleanup",
    "Chill Picking",
    "Chill Pick Cleanup",
  ],
  Bagging: ["Bagging", "Bagging Runner", "Bagging Cleanup"],
  Decant: [
    "MHE",
    "Ambient Decant",
    "Ambient Decant Cleanup",
    "Pallet Cleanup",
    "Baler Task",
    "Chill Decant",
    "Chill Decant Cleanup",
  ],
  Freezer: [
    "Freezer Decant",
    "Freezer Putaway",
    "Freezer Pick",
    "Freezer Cleanup",
    "Unload And Icing Trolly",
  ],
  Dispatch: [
    "Frameload",
    "MHE",
    "Dekit",
    "Van Loading",
    "Dispatch Cleanup",
    "Van Dekit",
    "Trailer Dekit",
    "Trailer Loading",
    "Consolidation",
  ],
  IC: [
    "IMS",
    "Inbound Office",
    "Investigating non-cons",
    "Investigating SKUs",
    "Tracking POs",
    "Purge tasks",
  ],
};

const CSV_HEADERS = ["task", "department", "startTime", "endTime", "duration"];

// ===============================
// MAIN COMPONENT
// ===============================
function App() {
  // Core state
  const [employeeId, setEmployeeId] = useState("");
  const [currentTasks, setCurrentTasks] = useState({});
  const [taskLogs, setTaskLogs] = useState([]);

  // Admin state
  const [isAdminId, setIsAdminId] = useState(false); // ID is in ADMIN_IDS
  const [adminAuthenticated, setAdminAuthenticated] = useState(false); // password OK
  const [showLive, setShowLive] = useState(false);

  // Timer for live durations
  const [tick, setTick] = useState(0);

  // Input validation
  const [inputError, setInputError] = useState("");

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Clear dialogs
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);

  // Pre-confirm dialog state
  const [showPreConfirmDialog, setShowPreConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "clearCurrent" | "clearHistory" | null

  // Admin password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // FILTER STATE (shared between live + history, AND logic)
  const [filterEmployeeIdEnabled, setFilterEmployeeIdEnabled] = useState(false);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");

  const [filterTaskEnabled, setFilterTaskEnabled] = useState(false);
  const [filterTaskDept, setFilterTaskDept] = useState("");
  const [filterTaskName, setFilterTaskName] = useState("");

  const [filterDateEnabled, setFilterDateEnabled] = useState(false);
  const [filterDate, setFilterDate] = useState("");

  const [filterDurationEnabled, setFilterDurationEnabled] = useState(false);
  const [filterDurationMin, setFilterDurationMin] = useState("");

  const isCentered = !employeeId && !adminAuthenticated;

  // ===============================
  // ADMIN BULK TASK UPDATE STATE
  // ===============================
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [adminUpdateDept, setAdminUpdateDept] = useState("");
  const [adminUpdateTask, setAdminUpdateTask] = useState("");



  const isEmployeeIdValidFormat = (id) =>
    /^[a-z]+(?:\.[a-z]+)(?:\d+)?$/.test(id);

  const canShowTaskButtons =
    !adminAuthenticated &&
    !isAdminId &&
    !!employeeId &&
    !inputError; // blocks invalid ID or admin IDs

  // ===============================
  // TIMER FOR LIVE DURATION
  // ===============================
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ===============================
  // LIVE activeTasks subscription
  // ===============================
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "activeTasks"), (snap) => {
      const map = {};
      snap.forEach((d) => (map[d.id] = d.data()));
      setCurrentTasks(map);
    });
    return () => unsub();
  }, []);

  // ===============================
  // Load logs on start
  // ===============================
  useEffect(() => {
    const loadLogs = async () => {
      const qLogs = query(collection(db, "taskLogs"), orderBy("startTime"));
      const snap = await getDocs(qLogs);
      setTaskLogs(snap.docs.map((d) => d.data()));
    };
    loadLogs();
  }, []);

  // ===============================
  // ADMIN ID DETECT → trigger password dialog
  // ===============================
  useEffect(() => {
    if (!employeeId || !isEmployeeIdValidFormat(employeeId)) {
      setIsAdminId(false);
      return;
    }

    const isAdmin = ADMIN_IDS.includes(employeeId);
    setIsAdminId(isAdmin);

    if (isAdmin && !adminAuthenticated) {
      setShowPasswordDialog(true);
      setPasswordError("");
      setAdminPassword("");
    }
  }, [employeeId, adminAuthenticated]);

  const exitAdminMode = () => {
    setAdminAuthenticated(false);
    setIsAdminId(false);
    setEmployeeId("");
    setShowLive(false);
    setShowHistory(false);
  };

  // ===============================
  // SAVE COMPLETED TASK
  // ===============================
  const isValidCompletedRow = (row) =>
    row?.employeeId &&
    row?.task &&
    row?.department &&
    row?.startTime &&
    row?.endTime;

  const saveCompletedTask = async (row) => {
    if (!isValidCompletedRow(row)) return;
    await addDoc(collection(db, "taskLogs"), row);
    setTaskLogs((p) => [...p, row]);
  };

  const toggleSelectedEmployee = (id) => {
    setSelectedEmployees((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const adminUpdateTaskForSelected = async () => {
    if (!selectedEmployees.length) return alert("No employees selected!");
    if (!adminUpdateDept || !adminUpdateTask)
      return alert("Select both department and task!");

    const now = new Date().toISOString();

    for (const id of selectedEmployees) {
      const old = currentTasks[id];

      // close old task if exists
      if (old) {
        await saveCompletedTask({
          employeeId: id,
          task: old.task,
          department: old.department,
          startTime: old.startTime,
          endTime: now,
        });
      }

      // set new task
      await setDoc(doc(db, "activeTasks", id), {
        employeeId: id,
        task: adminUpdateTask,
        department: adminUpdateDept,
        startTime: now,
        endTime: null,
      });
    }

    alert("Task updated successfully!");
    setSelectedEmployees([]);
  };

  // ===============================
  // HANDLE TASK CHANGE
  // ===============================
  const handleTaskChange = async (task, department) => {
    // block if ID invalid or we are in admin mode
    if (!employeeId || inputError || isAdminId || adminAuthenticated) return;

    const id = employeeId.trim();
    const now = new Date().toISOString();

    // Close previous task if exists
    if (currentTasks[id]) {
      const old = currentTasks[id];
      await saveCompletedTask({
        employeeId: id,
        task: old.task,
        department: old.department,
        startTime: old.startTime,
        endTime: now,
      });
    }

    // SHIFT END
    if (task.toLowerCase().includes("shift end")) {
      await saveCompletedTask({
        employeeId: id,
        task: "Shift End",
        department,
        startTime: now,
        endTime: now,
      });

      await deleteDoc(doc(db, "activeTasks", id));
      setEmployeeId("");
      return;
    }

    // Normal task
    await setDoc(doc(db, "activeTasks", id), {
      employeeId: id,
      task,
      department,
      startTime: now,
      endTime: null,
    });

    setEmployeeId("");
  };

  // ===============================
  // DURATION HELPERS
  // ===============================
  const durationFromSecs = (secs) => {
    const s = Math.max(0, Math.floor(secs));
    return (
      String(Math.floor(s / 3600)).padStart(2, "0") +
      ":" +
      String(Math.floor((s % 3600) / 60)).padStart(2, "0") +
      ":" +
      String(s % 60).padStart(2, "0")
    );
  };

  const getDurationSecsLive = (row) => {
    const start = new Date(row.startTime);
    const end = row.endTime ? new Date(row.endTime) : new Date();
    return Math.max(0, Math.floor((end - start) / 1000));
  };

  const getDuration = (row) => durationFromSecs(getDurationSecsLive(row));

  // ===============================
  // MERGE HISTORY ROWS
  // ===============================
  const mergeHistoryRows = (rows) => {
    const grouped = {};

    rows.forEach((r) => {
      const key = `${r.employeeId}__${r.task}__${r.date}`;
      if (!grouped[key]) {
        grouped[key] = { ...r, durationSecs: Number(r.durationSecs) || 0 };
      } else {
        grouped[key].durationSecs += Number(r.durationSecs) || 0;
      }
    });

    return Object.values(grouped);
  };

  // ===============================
// FILTER HELPERS (AND logic) — UPDATED
// Supports MULTIPLE employee IDs
// ===============================
const parseEmployeeTerms = (text) => {
  return text
    .toLowerCase()
    .split(/[\s,]+/)        // split by space OR comma
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
};

const applyLiveFilters = (rows) => {
  return rows.filter((t) => {
    // EMPLOYEE MULTI-FILTER
    if (filterEmployeeIdEnabled) {
      const terms = parseEmployeeTerms(filterEmployeeId);
      if (terms.length > 0) {
        const match = terms.some((term) =>
          t.employeeId?.toLowerCase().includes(term)
        );
        if (!match) return false;
      }
    }

    // Task + Department filter
    if (filterTaskEnabled) {
      if (filterTaskDept && t.department !== filterTaskDept) return false;
      if (filterTaskName && t.task !== filterTaskName) return false;
    }

    // Date filter
    if (filterDateEnabled && filterDate) {
      const dateStr = t.startTime.slice(0, 10);
      if (dateStr !== filterDate) return false;
    }

    // Duration (minutes)
    if (filterDurationEnabled && filterDurationMin) {
      const mins = getDurationSecsLive(t) / 60;
      if (mins < Number(filterDurationMin)) return false;
    }

    return true;
  });
};

const applyHistoryFilters = (rows) => {
  return rows.filter((r) => {
    // EMPLOYEE MULTI-FILTER
    if (filterEmployeeIdEnabled) {
      const terms = parseEmployeeTerms(filterEmployeeId);
      if (terms.length > 0) {
        const match = terms.some((term) =>
          r.employeeId?.toLowerCase().includes(term)
        );
        if (!match) return false;
      }
    }

    // Task + Department
    if (filterTaskEnabled) {
      if (filterTaskDept && r.department !== filterTaskDept) return false;
      if (filterTaskName && r.task !== filterTaskName) return false;
    }

    // Date filter
    if (filterDateEnabled && filterDate) {
      if (r.date !== filterDate) return false;
    }

    // Duration
    if (filterDurationEnabled && filterDurationMin) {
      const mins = (Number(r.durationSecs) || 0) / 60;
      if (mins < Number(filterDurationMin)) return false;
    }

    return true;
  });
};


  // ===============================
  // EXPORT CURRENT CSV
  // ===============================
  const exportCSV = async () => {
    const snap = await getDocs(query(collection(db, "taskLogs"), orderBy("startTime")));
    const rows = snap.docs.map((d) => d.data());
    if (!rows.length) return;

    const grouped = {};
    rows.forEach((r) => {
      const emp = r.employeeId;
      if (!grouped[emp]) grouped[emp] = [];
      grouped[emp].push({ ...r, duration: getDuration(r) });
    });

    let csv = "";
    Object.keys(grouped)
      .sort()
      .forEach((emp) => {
        csv += `Employee: ${emp}\n${CSV_HEADERS.join(",")}\n`;
        grouped[emp]
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .forEach((r) => {
            csv += CSV_HEADERS.map((h) => `"${r[h] ?? ""}"`).join(",") + "\n";
          });
        csv += "\n";
      });

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-report.csv";
    a.click();
  };

  // ===============================
  // LOAD DATE-RANGE HISTORY
  // ===============================
  const loadDateRangeHistory = async () => {
    if (!startDate || !endDate) return;

    setHistoryLoaded(false);

    const qHist = query(
      collection(db, "weeklyHistory"),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );

    const snap = await getDocs(qHist);
    const merged = mergeHistoryRows(snap.docs.map((d) => d.data()));

    setHistoryRows(merged);
    setHistoryLoaded(true);
  };

  // ===============================
  // EXPORT HISTORY CSV
  // ===============================
  const exportWeeklyCSV = () => {
    if (!historyRows.length) return;

    const grouped = {};
    historyRows.forEach((r) => {
      if (!grouped[r.employeeId]) grouped[r.employeeId] = [];
      grouped[r.employeeId].push(r);
    });

    let csv = "";
    Object.keys(grouped)
      .sort()
      .forEach((emp) => {
        csv += `Employee: ${emp}\n`;
        csv += "task,department,date,duration\n";

        grouped[emp]
          .sort((a, b) => a.date.localeCompare(b.date))
          .forEach((row) => {
            csv += `"${row.task}","${row.department}","${row.date}","${durationFromSecs(
              row.durationSecs
            )}"\n`;
          });

        csv += "\n";
      });

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "history.csv";
    a.click();
  };

  // ===============================
  // CLEAR WEEKLY HISTORY
  // ===============================
  const clearWeeklyHistory = async () => {
    const snap = await getDocs(collection(db, "weeklyHistory"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    setHistoryRows([]);
    setHistoryLoaded(false);
  };

  // ===============================
  // MOVE LOGS → WEEKLY HISTORY & CLEAR
  // ===============================
  const moveLogsToHistoryAndClear = async () => {
    const snap = await getDocs(collection(db, "taskLogs"));
    const docs = snap.docs.map((d) => d.data());

    // Move to history
    await Promise.all(
      docs.map((log) =>
        addDoc(collection(db, "weeklyHistory"), {
          employeeId: log.employeeId,
          task: log.task,
          department: log.department,
          durationSecs: Math.floor(
            (new Date(log.endTime) - new Date(log.startTime)) / 1000
          ),
          date: log.startTime.slice(0, 10),
        })
      )
    );

    // Clear logs
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));

    // Clear active tasks
    const activeSnap = await getDocs(collection(db, "activeTasks"));
    await Promise.all(activeSnap.docs.map((d) => deleteDoc(d.ref)));

    setTaskLogs([]);
    setCurrentTasks({});
  };

  // ===============================
  // ADMIN PASSWORD HANDLERS
  // ===============================
  const handlePasswordSubmit = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminAuthenticated(true);
      setShowPasswordDialog(false);
      setPasswordError("");
    } else {
      setPasswordError("Incorrect password.");
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordDialog(false);
    setPasswordError("");
    setAdminPassword("");
    setAdminAuthenticated(false);
    setIsAdminId(false);
    setEmployeeId("");
  };

  // ===============================
  // DERIVED FILTERED DATA
  // ===============================
  const liveRowsFiltered = applyLiveFilters(Object.values(currentTasks || {}));
  const historyRowsFiltered = applyHistoryFilters(historyRows || []);

  // ===============================
  // RENDER
  // ===============================
  return (
    <div id="root">
      {/* =======================
          ADMIN PASSWORD DIALOG
      ======================== */}
      {showPasswordDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Admin Login</h3>
            <p>
              Enter admin password for: <strong>{employeeId}</strong>
            </p>

            <input
              type="password"
              placeholder="Password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                margin: "0.5rem 0",
                width: "100%",
                boxSizing: "border-box",
              }}
            />

            {passwordError && (
              <div
                className="input-error"
                style={{ marginBottom: "0.5rem" }}
              >
                {passwordError}
              </div>
            )}

            <div className="dialog-buttons">
              <button className="confirm-clear" onClick={handlePasswordSubmit}>
                Login
              </button>

              <button className="cancel-clear" onClick={handlePasswordCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          PRE-CONFIRM DIALOG
      ======================== */}
      {showPreConfirmDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Have you saved the data?</h3>
            <div className="dialog-buttons">
              <button
                className="confirm-clear"
                onClick={() => {
                  setShowPreConfirmDialog(false);
                  if (pendingAction === "clearCurrent") {
                    setShowClearDialog(true);
                  } else if (pendingAction === "clearHistory") {
                    setShowClearHistoryDialog(true);
                  }
                  setPendingAction(null);
                }}
              >
                Yes
              </button>

              <button
                className="cancel-clear"
                onClick={() => {
                  setShowPreConfirmDialog(false);
                  setPendingAction(null);
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          CLEAR CURRENT LOGS DIALOG
      ======================== */}
      {showClearDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Move Logs to History & Clear?</h3>
            <p>
              This moves all completed logs to history and clears current logs +
              live tasks.
            </p>

            <div className="dialog-buttons">
              <button
                className="confirm-clear"
                onClick={async () => {
                  await moveLogsToHistoryAndClear();
                  setShowClearDialog(false);
                }}
              >
                Clear
              </button>

              <button
                className="cancel-clear"
                onClick={() => setShowClearDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          CLEAR HISTORY DIALOG
      ======================== */}
      {showClearHistoryDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Clear History?</h3>
            <p>This will permanently delete all history records.</p>

            <div className="dialog-buttons">
              <button
                className="confirm-clear"
                onClick={async () => {
                  await clearWeeklyHistory();
                  setShowClearHistoryDialog(false);
                }}
              >
                Clear
              </button>

              <button
                className="cancel-clear"
                onClick={() => setShowClearHistoryDialog(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =======================
          MAIN TITLE + INPUT
      ======================== */}
      <div className={isCentered ? "center-screen" : "top-screen"}>
        <h1>Task Tracker</h1>

        {!adminAuthenticated && (
          <>
            <input
              placeholder="Scan Employee ID"
              value={employeeId}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().trim();
                if (!v) {
                  setEmployeeId("");
                  setInputError("");
                  setIsAdminId(false);
                  return;
                }

                if (!isEmployeeIdValidFormat(v)) {
                  setInputError(
                    "Invalid format. Use firstname.lastname or firstname.lastname2"
                  );
                  setEmployeeId(v);
                  setIsAdminId(false);
                  return;
                }

                setInputError("");
                setEmployeeId(v);
              }}
              autoFocus
            />
            {inputError && <div className="input-error">{inputError}</div>}
          </>
        )}
      </div>

      {/* =======================
          ADMIN MODE
      ======================== */}
      {adminAuthenticated && (
        <div className="admin-scroll">
          <div style={{ textAlign: "center" }}>
            <h2>ADMIN MODE ({employeeId})</h2>

            <div className="admin-buttons">
              <button onClick={() => setShowLive(!showLive)}>
                {showLive ? "Hide Live View" : "View Live"}
              </button>

              <button onClick={exportCSV}>Download Current CSV</button>

              <button
                className="clear-data"
                onClick={() => {
                  setPendingAction("clearCurrent");
                  setShowPreConfirmDialog(true);
                }}
              >
                Move to History & Clear
              </button>

              <button onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? "Hide History" : "View History"}
              </button>

              <button
                className="clear-data"
                onClick={() => {
                  setPendingAction("clearHistory");
                  setShowPreConfirmDialog(true);
                }}
              >
                Clear History
              </button>

              <button className="exit-admin" onClick={exitAdminMode}>
                Exit Admin Mode
              </button>
            </div>
          </div>

          {/* =======================
              LIVE VIEW
          ======================== */}
          {showLive && (
            <>
              {/* FILTERS (LIVE) */}
              <div
                className="history-controls"
                style={{ marginTop: "12px" }}
              >
                {/* Employee ID filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterEmployeeIdEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterEmployeeIdEnabled(checked);
                        if (!checked) setFilterEmployeeId("");
                      }}
                    />
                    <span>Employee ID</span>
                  </label>
                  {filterEmployeeIdEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="text"
                      value={filterEmployeeId}
                      onChange={(e) => setFilterEmployeeId(e.target.value)}
                      placeholder="Search employee"
                    />
                  )}
                </div>

                {/* Task + Dept filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterTaskEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterTaskEnabled(checked);
                        if (!checked) {
                          setFilterTaskDept("");
                          setFilterTaskName("");
                        }
                      }}
                    />
                    <span>Task</span>
                  </label>

                  {filterTaskEnabled && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        marginTop: "4px",
                        gap: "4px",
                      }}
                    >
                      {/* Department select */}
                      <select
                        value={filterTaskDept}
                        onChange={(e) => {
                          setFilterTaskDept(e.target.value);
                          setFilterTaskName("");
                        }}
                      >
                        <option value="">All Departments</option>
                        {DEPARTMENT_ORDER.map((dep) => (
                          <option key={dep} value={dep}>
                            {dep}
                          </option>
                        ))}
                      </select>

                      {/* Task select (depends on department) */}
                      <select
                        value={filterTaskName}
                        onChange={(e) => setFilterTaskName(e.target.value)}
                        disabled={!filterTaskDept}
                      >
                        <option value="">
                          {filterTaskDept
                            ? "All Tasks"
                            : "Select department first"}
                        </option>
                        {filterTaskDept &&
                          (DEPARTMENTS[filterTaskDept] || []).map((task) => (
                            <option key={task} value={task}>
                              {task}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Date (exact) filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterDateEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterDateEnabled(checked);
                        if (!checked) setFilterDate("");
                      }}
                    />
                    <span>Date</span>
                  </label>
                  {filterDateEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                    />
                  )}
                </div>

                {/* Duration (minutes) filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterDurationEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterDurationEnabled(checked);
                        if (!checked) setFilterDurationMin("");
                      }}
                    />
                    <span>Duration ≥ (min)</span>
                  </label>
                  {filterDurationEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="number"
                      min="0"
                      value={filterDurationMin}
                      onChange={(e) => setFilterDurationMin(e.target.value)}
                      placeholder="Minutes"
                    />
                  )}
                </div>
              </div>

              {/* ADMIN BULK TASK UPDATE PANEL — NOW ABOVE THE TABLE */}
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  border: "1px solid #ccc",
                  borderRadius: "8px",
                  background: "#f9f9f9",
                  maxWidth: "600px",
                  marginLeft: "auto",
                  marginRight: "auto",
                  textAlign: "center",
                }}
              >
                <h3>Update Task for Selected Employees</h3>

                {/* Department Dropdown */}
                <div style={{ marginTop: "8px" }}>
                  <label>Department:&nbsp;</label>
                  <select
                    value={adminUpdateDept}
                    onChange={(e) => {
                      setAdminUpdateDept(e.target.value);
                      setAdminUpdateTask("");
                    }}
                  >
                    <option value="">Select department</option>
                    {DEPARTMENT_ORDER.map((dep) => (
                      <option key={dep} value={dep}>
                        {dep}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Dropdown (depends on department) */}
                {adminUpdateDept && (
                  <div style={{ marginTop: "8px" }}>
                    <label>Task:&nbsp;</label>
                    <select
                      value={adminUpdateTask}
                      onChange={(e) => setAdminUpdateTask(e.target.value)}
                    >
                      <option value="">Select task</option>
                      {DEPARTMENTS[adminUpdateDept].map((task) => (
                        <option key={task} value={task}>
                          {task}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Button */}
                <button
                  style={{ marginTop: "12px", padding: "8px 16px" }}
                  onClick={adminUpdateTaskForSelected}
                  disabled={!selectedEmployees.length}
                >
                  Update Task for Selected ({selectedEmployees.length})
                </button>
              </div>

              {/* LIVE TABLE BELOW THE PANEL */}
              <div className="live-container" style={{ marginTop: "20px" }}>
                <table>
                  <thead>
                    <tr>
                      <th
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          textAlign: "center",
                          padding: "0",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span>Select All</span>
                          <input
                            type="checkbox"
                            checked={
                              liveRowsFiltered.length > 0 &&
                              selectedEmployees.length === liveRowsFiltered.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmployees(liveRowsFiltered.map((r) => r.employeeId));
                              } else {
                                setSelectedEmployees([]);
                              }
                            }}
                          />
                        </div>
                      </th>

                      <th>Employee</th>
                      <th>Task</th>
                      <th>Department</th>
                      <th>Start</th>
                      <th>Duration</th>
                    </tr>
                  </thead>

                  <tbody>
                    {liveRowsFiltered.map((t, i) => (
                      <tr key={i}>
                        <td style={{ width: "1%", textAlign: "center", padding: "0" }}>
                          <input
                            type="checkbox"
                            checked={selectedEmployees.includes(t.employeeId)}
                            onChange={() => toggleSelectedEmployee(t.employeeId)}
                          />
                        </td>
                        <td>{t.employeeId}</td>
                        <td>{t.task}</td>
                        <td>{t.department}</td>
                        <td>{new Date(t.startTime).toLocaleString()}</td>
                        <td>{getDuration(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </>
          )}

          {/* =======================
              HISTORY VIEW
          ======================== */}
          {showHistory && (
            <div className="history-container">
              <h2 style={{ textAlign: "center", marginBottom: "8px" }}>
                History (Date Range)
              </h2>

              {/* DATE RANGE CONTROLS */}
              <div className="history-controls">
                <label>
                  Start:
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setHistoryLoaded(false);
                      setHistoryRows([]);
                    }}
                  />
                </label>

                <label style={{ marginLeft: "20px" }}>
                  End:
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setHistoryLoaded(false);
                      setHistoryRows([]);
                    }}
                  />
                </label>

                <button
                  onClick={loadDateRangeHistory}
                  disabled={!startDate || !endDate}
                >
                  Load
                </button>

                <button
                  onClick={exportWeeklyCSV}
                  disabled={!historyRowsFiltered.length}
                >
                  Download CSV
                </button>

                <button
                  className="clear-data"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setHistoryRows([]);
                    setHistoryLoaded(false);
                  }}
                >
                  Clear Selection
                </button>
              </div>

              {/* FILTERS (HISTORY) */}
              <div
                className="history-controls"
                style={{ marginTop: "4px" }}
              >
                {/* Employee ID filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterEmployeeIdEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterEmployeeIdEnabled(checked);
                        if (!checked) setFilterEmployeeId("");
                      }}
                    />
                    <span>Employee ID</span>
                  </label>
                  {filterEmployeeIdEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="text"
                      value={filterEmployeeId}
                      onChange={(e) => setFilterEmployeeId(e.target.value)}
                      placeholder="Search employee"
                    />
                  )}
                </div>

                {/* Task + Dept filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterTaskEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterTaskEnabled(checked);
                        if (!checked) {
                          setFilterTaskDept("");
                          setFilterTaskName("");
                        }
                      }}
                    />
                    <span>Task</span>
                  </label>

                  {filterTaskEnabled && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        marginTop: "4px",
                        gap: "4px",
                      }}
                    >
                      <select
                        value={filterTaskDept}
                        onChange={(e) => {
                          setFilterTaskDept(e.target.value);
                          setFilterTaskName("");
                        }}
                      >
                        <option value="">All Departments</option>
                        {DEPARTMENT_ORDER.map((dep) => (
                          <option key={dep} value={dep}>
                            {dep}
                          </option>
                        ))}
                      </select>

                      <select
                        value={filterTaskName}
                        onChange={(e) => setFilterTaskName(e.target.value)}
                        disabled={!filterTaskDept}
                      >
                        <option value="">
                          {filterTaskDept
                            ? "All Tasks"
                            : "Select department first"}
                        </option>
                        {filterTaskDept &&
                          (DEPARTMENTS[filterTaskDept] || []).map((task) => (
                            <option key={task} value={task}>
                              {task}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Date filter (exact date inside range) */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterDateEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterDateEnabled(checked);
                        if (!checked) setFilterDate("");
                      }}
                    />
                    <span>Date</span>
                  </label>
                  {filterDateEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="date"
                      value={filterDate}
                      onChange={(e) => setFilterDate(e.target.value)}
                    />
                  )}
                </div>

                {/* Duration filter */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterDurationEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterDurationEnabled(checked);
                        if (!checked) setFilterDurationMin("");
                      }}
                    />
                    <span>Duration ≥ (min)</span>
                  </label>
                  {filterDurationEnabled && (
                    <input
                      style={{ marginTop: "4px" }}
                      type="number"
                      min="0"
                      value={filterDurationMin}
                      onChange={(e) => setFilterDurationMin(e.target.value)}
                      placeholder="Minutes"
                    />
                  )}
                </div>
              </div>

              {/* RESULTS */}
              <div className="history-output">
                {historyLoaded && historyRowsFiltered.length === 0 && (
                  <p>No records found.</p>
                )}

                {Object.entries(
                  historyRowsFiltered.reduce((acc, r) => {
                    if (!acc[r.employeeId]) acc[r.employeeId] = [];
                    acc[r.employeeId].push(r);
                    return acc;
                  }, {})
                )
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([emp, rows]) => (
                    <div key={emp} className="history-block">
                      <h3>Employee: {emp}</h3>

                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>Task</th>
                            <th>Department</th>
                            <th>Date</th>
                            <th>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((r, idx) => (
                              <tr key={idx}>
                                <td>{r.task}</td>
                                <td>{r.department}</td>
                                <td>{r.date}</td>
                                <td>{durationFromSecs(r.durationSecs)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =======================
          USER MODE (TASK BUTTONS)
      ======================== */}
      {!adminAuthenticated && canShowTaskButtons && (
        <div className="task-grid">
          {DEPARTMENT_ORDER.map((dep) => (
            <div key={dep} className="task-group">
              <h3>{dep}</h3>
              <div className="task-buttons">
                {DEPARTMENTS[dep].map((task) => (
                  <button
                    key={task}
                    onClick={() => handleTaskChange(task, dep)}
                  >
                    {task}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
