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

const ADMIN_IDS = ["ajaypal.sangha", "abin.thomas", "camilo.torres"];

const DEPARTMENT_ORDER = [
  "Others",
  "Tote Wash",
  "Pick",
  "Bagging",
  "Decant",
  "Freezer",
  "Dispatch",
];

const DEPARTMENTS = {
  Others: ["Shift End", "Washroom", "Break", "Move To Another Department"],
  "Tote Wash": ["Tote Wash", "Tote Wash Cleanup", "Move Pallets"],
  Pick: ["Ambient Picking", "Ambient Pick Cleanup", "Chill Picking", "Chill Pick Cleanup"],
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
  ],
};

// FIXED CSV HEADER ORDER FOR CURRENT LOGS
const CSV_HEADERS = ["task", "department", "startTime", "endTime", "duration"];

function App() {
  const [employeeId, setEmployeeId] = useState("");
  const [currentTasks, setCurrentTasks] = useState({}); // activeTasks from Firestore
  const [taskLogs, setTaskLogs] = useState([]);         // completed logs from Firestore
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [tick, setTick] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [inputError, setInputError] = useState("");

  // Weekly history UI state
  const [showHistory, setShowHistory] = useState(false);
  const [historyDate, setHistoryDate] = useState("");     // yyyy-mm-dd
  const [historyRows, setHistoryRows] = useState([]);     // rows from weeklyHistory

  const isCentered = !employeeId && !isAdmin;

  /* ------------------------------------
     DURATION TIMER (live view refresh)
  ------------------------------------ */
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  /* ------------------------------------
     SUBSCRIBE TO ACTIVE TASKS (LIVE VIEW)
     Persists across refresh
  ------------------------------------ */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "activeTasks"), (snap) => {
      const activeMap = {};
      snap.forEach((d) => {
        activeMap[d.id] = d.data();
      });
      setCurrentTasks(activeMap);
    });

    return () => unsub();
  }, []);

  /* ------------------------------------
     LOAD COMPLETED LOGS ON START
  ------------------------------------ */
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const q = query(collection(db, "taskLogs"), orderBy("startTime", "asc"));
        const snap = await getDocs(q);
        setTaskLogs(snap.docs.map((d) => d.data()));
      } catch (err) {
        console.error("🔥 Load taskLogs error:", err);
      }
    };
    loadLogs();
  }, []);

  /* ------------------------------------
     ADMIN DETECT
  ------------------------------------ */
  useEffect(() => {
    if (!employeeId.trim()) return;
    setIsAdmin(ADMIN_IDS.includes(employeeId.trim()));
  }, [employeeId]);

  const exitAdminMode = () => {
    setIsAdmin(false);
    setEmployeeId("");
    setShowLive(false);
    setShowHistory(false);
  };

  /* ------------------------------------
     SAFE SCHEMA GUARD (prevents bad docs)
  ------------------------------------ */
  const isValidCompletedRow = (row) => {
    return (
      row &&
      typeof row.employeeId === "string" &&
      typeof row.task === "string" &&
      typeof row.department === "string" &&
      typeof row.startTime === "string" &&
      typeof row.endTime === "string"
    );
  };

  /* ------------------------------------
     SAVE COMPLETED TASK
  ------------------------------------ */
  const saveCompletedTask = async (task) => {
    if (!isValidCompletedRow(task)) {
      console.error("🔥 Blocked invalid row:", task);
      return;
    }
    try {
      await addDoc(collection(db, "taskLogs"), task);
      setTaskLogs((prev) => [...prev, task]);
    } catch (err) {
      console.error("🔥 Firestore write error:", err);
    }
  };

  /* ------------------------------------
     HANDLE TASK CHANGE
     - close old task -> taskLogs
     - new active task -> activeTasks doc
     - shift end -> close old + add shift end + delete active doc
  ------------------------------------ */
  const handleTaskChange = async (task, department) => {
    const nowISO = new Date().toISOString();
    const id = employeeId.trim();

    // CLOSE previous active task if exists
    if (currentTasks[id]) {
      const old = currentTasks[id];

      const completed = {
        employeeId: id,
        task: old.task,
        department: old.department,
        startTime: old.startTime,
        endTime: nowISO,
      };

      await saveCompletedTask(completed);
    }

    // SHIFT END: log shift end + remove from activeTasks
    if (task.toLowerCase().includes("shift end")) {
      const shiftEndRow = {
        employeeId: id,
        task: "Shift End",
        department,
        startTime: nowISO,
        endTime: nowISO,
      };

      await saveCompletedTask(shiftEndRow);

      try {
        await deleteDoc(doc(db, "activeTasks", id));
      } catch (err) {
        console.error("🔥 delete activeTasks error:", err);
      }

      setEmployeeId("");
      setIsAdmin(false);
      setShowLive(false);
      return;
    }

    // NORMAL TASK: write active task to Firestore
    const activeTask = {
      employeeId: id,
      task,
      department,
      startTime: nowISO,
      endTime: null,
    };

    try {
      await setDoc(doc(db, "activeTasks", id), activeTask);
    } catch (err) {
      console.error("🔥 set activeTasks error:", err);
    }

    setEmployeeId("");
    setIsAdmin(false);
    setShowLive(false);
  };

  /* ------------------------------------
     DURATION HELPERS
  ------------------------------------ */
  const getDuration = (t) => {
    const start = new Date(t.startTime);
    const end = t.endTime ? new Date(t.endTime) : new Date();
    const diff = Math.floor((end - start) / 1000);
    return formatDurationFromSecs(diff);
  };

  const formatDurationFromSecs = (secs) => {
    const safe = Math.max(0, Math.floor(secs || 0));
    const h = String(Math.floor(safe / 3600)).padStart(2, "0");
    const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
    const s = String(safe % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  /* ------------------------------------
     EXPORT CSV (CURRENT COMPLETED LOGS)
     FIXED header order + fixed row order
  ------------------------------------ */
  const exportCSV = async () => {
    try {
      const qLogs = query(collection(db, "taskLogs"), orderBy("startTime", "asc"));
      const snap = await getDocs(qLogs);
      const logs = snap.docs.map((d) => d.data());

      if (logs.length === 0) {
        console.warn("No completed logs to export.");
        return;
      }

      // Enrich with duration and sanitize
      const enriched = logs
        .filter(isValidCompletedRow)
        .map((r) => ({
          ...r,
          duration: getDuration(r),
        }));

      // Group by employee
      const grouped = {};
      enriched.forEach((r) => {
        if (!grouped[r.employeeId]) grouped[r.employeeId] = [];
        grouped[r.employeeId].push(r);
      });

      const employees = Object.keys(grouped).sort();
      let csv = "";

      employees.forEach((emp) => {
        csv += `Employee: ${emp}\n`;
        csv += CSV_HEADERS.join(",") + "\n";

        const rows = grouped[emp].sort(
          (a, b) => new Date(a.startTime) - new Date(b.startTime)
        );

        rows.forEach((row) => {
          const line = CSV_HEADERS.map((h) => `"${row[h] ?? ""}"`).join(",");
          csv += line + "\n";
        });

        csv += "\n";
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "task-report.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("🔥 CSV export error:", err);
    }
  };

  /* ------------------------------------
     WEEKLY HISTORY HELPERS
  ------------------------------------ */

  // Compute Monday–Sunday week range for given yyyy-mm-dd
  const getWeekRangeForDate = (dateStr) => {
    const base = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime())) return null;

    const day = base.getDay(); // 0 = Sunday, 1 = Monday, ...
    const diffToMonday = (day + 6) % 7; // days since Monday
    const monday = new Date(base);
    monday.setDate(base.getDate() - diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const toYMD = (d) => d.toISOString().slice(0, 10);

    return {
      start: toYMD(monday),
      end: toYMD(sunday),
    };
  };

  // Load weekly history rows from weeklyHistory collection
  const loadWeeklyHistory = async () => {
    if (!historyDate) return;

    const range = getWeekRangeForDate(historyDate);
    if (!range) return;

    try {
      const qHist = query(
        collection(db, "weeklyHistory"),
        where("date", ">=", range.start),
        where("date", "<=", range.end)
      );
      const snap = await getDocs(qHist);
      const rows = snap.docs.map((d) => d.data());
      setHistoryRows(rows);
    } catch (err) {
      console.error("🔥 Weekly history load error:", err);
    }
  };

  // Weekly CSV: grouped by employee, then task
  const exportWeeklyCSV = () => {
    if (!historyRows.length) return;

    const grouped = {};
    historyRows.forEach((row) => {
      if (!grouped[row.employeeId]) grouped[row.employeeId] = {};
      if (!grouped[row.employeeId][row.task]) grouped[row.employeeId][row.task] = [];
      grouped[row.employeeId][row.task].push(row);
    });

    const employees = Object.keys(grouped).sort();
    let csv = "";

    employees.forEach((emp) => {
      csv += `Employee: ${emp}\n`;
      csv += "task,department,date,duration\n";

      const tasksByName = grouped[emp];
      Object.keys(tasksByName)
        .sort()
        .forEach((taskName) => {
          const rows = tasksByName[taskName].sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          rows.forEach((r) => {
            const durationStr = formatDurationFromSecs(r.durationSecs || 0);
            csv += [
              `"${r.task}"`,
              `"${r.department || ""}"`,
              `"${r.date}"`,
              `"${durationStr}"`,
            ].join(",") + "\n";
          });
        });

      csv += "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "weekly-history.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ------------------------------------
     MOVE LOGS → WEEKLY HISTORY ON CLEAR
  ------------------------------------ */
  const moveLogsToHistoryAndClear = async () => {
    try {
      // 1) Get all completed logs
      const logSnap = await getDocs(collection(db, "taskLogs"));
      const logDocs = logSnap.docs.map((d) => d.data());

      // 2) For each log, write a weeklyHistory entry
      const writes = logDocs
        .filter(isValidCompletedRow)
        .map((log) => {
          const start = new Date(log.startTime);
          const end = new Date(log.endTime);
          const durationSecs = Math.max(
            0,
            Math.floor((end - start) / 1000)
          );
          const dateStr = log.startTime.slice(0, 10); // yyyy-mm-dd

          const historyDoc = {
            employeeId: log.employeeId,
            task: log.task,
            department: log.department,
            durationSecs,
            date: dateStr,
          };

          return addDoc(collection(db, "weeklyHistory"), historyDoc);
        });

      await Promise.all(writes);

      // 3) Clear taskLogs
      const deleteLogPromises = logSnap.docs.map((d) =>
        deleteDoc(doc(db, "taskLogs", d.id))
      );
      await Promise.all(deleteLogPromises);

      // 4) Clear activeTasks
      const activeSnap = await getDocs(collection(db, "activeTasks"));
      const deleteActivePromises = activeSnap.docs.map((d) =>
        deleteDoc(doc(db, "activeTasks", d.id))
      );
      await Promise.all(deleteActivePromises);

      // 5) Clear local state
      setTaskLogs([]);
      setCurrentTasks([]);
    } catch (err) {
      console.error("🔥 Move logs & clear error:", err);
    }
  };

  /* ------------------------------------
     VALIDATE INPUT
  ------------------------------------ */
  const validEmployeeId = (id) => /^[a-z]+(?:\.[a-z]+)(?:\d+)?$/.test(id);

  /* ------------------------------------
     CLEAR DIALOG
  ------------------------------------ */
  const ClearDataDialog = () => (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <h3>Clear All Data?</h3>
        <p>
          This will move completed logs to weekly history, then clear current
          logs and live tasks from this device and database.
        </p>

        <div className="dialog-buttons">
          <button
            className="confirm-clear"
            onClick={async () => {
              await moveLogsToHistoryAndClear();
              setShowClearDialog(false);
            }}
          >
            Move to History & Clear
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
  );

  /* ------------------------------------
     UI
  ------------------------------------ */
  return (
    <div id="root">
      {showClearDialog && <ClearDataDialog />}

      <div className={isCentered ? "center-screen" : "top-screen"}>
        <h1>Task Tracker</h1>

        {!isAdmin && (
          <>
            <input
              placeholder="Scan Employee ID"
              value={employeeId}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().trim();
                if (value === "") return setEmployeeId("");
                if (!validEmployeeId(value)) {
                  setInputError(
                    "Invalid format. Use firstname.lastname or firstname.lastname2"
                  );
                  return setEmployeeId(value);
                }
                setInputError("");
                setEmployeeId(value);
              }}
              autoFocus
            />
            {inputError && <div className="input-error">{inputError}</div>}
          </>
        )}
      </div>

      {/* ADMIN UI */}
      {isAdmin && (
        <div style={{ textAlign: "center" }}>
          <h2>ADMIN MODE ({employeeId})</h2>

          <div className="admin-buttons">
            <button onClick={() => setShowLive((v) => !v)}>
              {showLive ? "Hide Live View" : "View Live"}
            </button>

            <button onClick={exportCSV}>Download Current CSV</button>

            <button
              className="clear-data"
              onClick={() => setShowClearDialog(true)}
            >
              Move to History & Clear
            </button>

            <button
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide Weekly History" : "View Weekly History"}
            </button>

            <button className="exit-admin" onClick={exitAdminMode}>
              Exit Admin Mode
            </button>
          </div>
        </div>
      )}

      {/* LIVE VIEW */}
      {isAdmin && showLive && (
        <div className="live-container">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Task</th>
                <th>Department</th>
                <th>Start Time</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(currentTasks).map((t, i) => (
                <tr key={i}>
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
      )}

      {/* WEEKLY HISTORY VIEW */}
      {isAdmin && showHistory && (
        <div className="history-container">
          <h2>Weekly History</h2>

          <div className="history-controls">
            <label>
              Week containing date:{" "}
              <input
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
              />
            </label>
            <button onClick={loadWeeklyHistory} disabled={!historyDate}>
              Load Week
            </button>
            <button
              onClick={exportWeeklyCSV}
              disabled={!historyRows.length}
            >
              Download Weekly CSV
            </button>
          </div>

          {/* Grouped display: by employee → by task */}
          <div className="history-groups">
            {historyRows.length === 0 && historyDate && (
              <p>No history records found for that week.</p>
            )}

            {Object.entries(
              historyRows.reduce((acc, row) => {
                if (!acc[row.employeeId]) acc[row.employeeId] = {};
                if (!acc[row.employeeId][row.task])
                  acc[row.employeeId][row.task] = [];
                acc[row.employeeId][row.task].push(row);
                return acc;
              }, {})
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([emp, tasksObj]) => (
                <div className="history-employee" key={emp}>
                  <h3>{emp}</h3>
                  {Object.entries(tasksObj)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([taskName, rows]) => (
                      <div className="history-task" key={taskName}>
                        <h4>{taskName}</h4>
                        <ul>
                          {rows
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((r, idx) => (
                              <li key={idx}>
                                {r.date} — {formatDurationFromSecs(r.durationSecs || 0)}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TASK BUTTONS */}
      {!isAdmin && employeeId && (
        <div className="task-grid">
          {DEPARTMENT_ORDER.map((dep) => (
            <div className="task-group" key={dep}>
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
