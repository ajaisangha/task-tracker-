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
  // ------------------------------
  // STATE
  // ------------------------------
  const [employeeId, setEmployeeId] = useState("");
  const [currentTasks, setCurrentTasks] = useState({});
  const [taskLogs, setTaskLogs] = useState([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [tick, setTick] = useState(0);

  const [inputError, setInputError] = useState("");

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Clear dialogs
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);

  // Pre-confirmation dialog
  const [showPreConfirmDialog, setShowPreConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // "clearHistory", "clearCurrent"

  const isCentered = !employeeId && !isAdmin;

  const employeeIdRegex = /^[a-z]+(?:\.[a-z]+)(?:\d+)?$/;

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
  // ADMIN DETECT
  // ===============================
  useEffect(() => {
    if (!employeeId) return;
    setIsAdmin(ADMIN_IDS.includes(employeeId));
  }, [employeeId]);

  const exitAdminMode = () => {
    setIsAdmin(false);
    setEmployeeId("");
    setShowLive(false);
    setShowHistory(false);
    setInputError("");
  };

  // ===============================
  // SAVE COMPLETED TASK
  // ===============================
  const isValidCompletedRow = (row) =>
    row?.employeeId && row?.task && row?.department && row?.startTime && row?.endTime;

  const saveCompletedTask = async (row) => {
    if (!isValidCompletedRow(row)) return;
    await addDoc(collection(db, "taskLogs"), row);
    setTaskLogs((p) => [...p, row]);
  };

  // ===============================
  // HANDLE TASK CHANGE
  // ===============================
  const handleTaskChange = async (task, department) => {
    const id = employeeId.trim();

    // HARD GUARD: do not allow if ID invalid
    if (!employeeIdRegex.test(id)) {
      setInputError("Invalid format");
      return;
    }

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
      setIsAdmin(false);
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
    setIsAdmin(false);
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

  const getDuration = (row) => {
    const start = new Date(row.startTime);
    const end = row.endTime ? new Date(row.endTime) : new Date();
    return durationFromSecs((end - start) / 1000);
  };

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
  // EXPORT CURRENT CSV
  // ===============================
  const exportCSV = async () => {
    const snap = await getDocs(
      query(collection(db, "taskLogs"), orderBy("startTime"))
    );
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
  // UI START
  // ===============================
  return (
    <div id="root">
      {/* PRE-CONFIRMATION DIALOG */}
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

      {/* CLEAR CURRENT DATA DIALOG */}
      {showClearDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Move Logs to History & Clear?</h3>
            <p>This moves all completed logs to history and clears everything.</p>

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

      {/* CLEAR HISTORY DIALOG */}
      {showClearHistoryDialog && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3>Clear Weekly History?</h3>
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

      {/* MAIN TITLE + INPUT */}
      <div className={isCentered ? "center-screen" : "top-screen"}>
        <h1>Task Tracker</h1>

        {!isAdmin && (
          <>
            <input
              placeholder="Scan Employee ID"
              value={employeeId}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().trim();

                if (!v) {
                  setEmployeeId("");
                  setInputError("");
                  return;
                }

                if (!employeeIdRegex.test(v)) {
                  setInputError(
                    "Invalid format. Use firstname.lastname or firstname.lastname2"
                  );
                  setEmployeeId(v);
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

      {/* ADMIN MODE */}
      {isAdmin && (
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
                Clear Weekly History
              </button>

              <button className="exit-admin" onClick={exitAdminMode}>
                Exit Admin Mode
              </button>
            </div>
          </div>

          {/* LIVE VIEW */}
          {showLive && (
            <div className="live-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Task</th>
                    <th>Department</th>
                    <th>Start</th>
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

          {/* HISTORY VIEW */}
          {showHistory && (
            <div className="history-container">
              <h2 style={{ textAlign: "center", marginBottom: "8px" }}>
                History (Date Range)
              </h2>

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
                  disabled={!historyRows.length}
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

              <div className="history-output">
                {historyLoaded && historyRows.length === 0 && (
                  <p>No records found.</p>
                )}

                {Object.entries(
                  historyRows.reduce((acc, r) => {
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

      {/* USER MODE (TASK BUTTONS) */}
      {!isAdmin && employeeId && !inputError && (
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
