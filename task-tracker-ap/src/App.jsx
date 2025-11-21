import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";
import "./App.css";

const ADMIN_IDS = ["ajaypal.sangha", "abin.thomas"];

const DEPARTMENT_ORDER = [
  "Others",
  "Tote Wash",
  "Pick",
  "Bagging",
  "Decant",
  "Freezer",
  "Dispatch"
];

const DEPARTMENTS = {
  Others: ["Shift start", "Shift end", "washroom", "break", "move to another department"],
  "Tote Wash": ["tote wash", "tote wash cleanup", "move pallets"],
  Pick: ["Ambient picking", "ambient pick cleanup", "chill picking", "chill pick cleanup"],
  Bagging: ["bagging", "bagging runner", "bagging cleanup"],
  Decant: [
    "MHE", "ambient decant", "ambient decant cleanup", "Pallet cleanup",
    "Baler task", "chill decant", "chill decant cleanup"
  ],
  Freezer: [
    "freezer decant", "freezer putaway", "freezer pick",
    "freezer cleanup", "unload and icing trolly"
  ],
  Dispatch: [
    "frameload", "MHE", "dekit", "van loading",
    "dispatch cleanup", "van dekit", "trailer dekit", "trailer loading"
  ]
};

function App() {
  const [employeeId, setEmployeeId] = useState("");
  const [currentTasks, setCurrentTasks] = useState({});
  const [taskLogs, setTaskLogs] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [tick, setTick] = useState(0);

  const isCentered = !employeeId && !isAdmin;

  // Timer to refresh live duration
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Detect admin after scan
  useEffect(() => {
    if (employeeId.trim() === "") return;
    setIsAdmin(ADMIN_IDS.includes(employeeId));
  }, [employeeId]);

  const exitAdminMode = () => {
    setIsAdmin(false);
    setEmployeeId("");
    setShowLive(false);
  };

  const handleTaskChange = async (task, department) => {
    const now = new Date();

    // Close previous task if active
    if (currentTasks[employeeId]) {
      const old = currentTasks[employeeId];

      const completed = {
        employeeId,
        task: old.task,
        department: old.department,
        startTime: old.startTime,
        endTime: now.toISOString()
      };

      setTaskLogs(prev => [...prev, completed]);
      await addDoc(collection(db, "taskLogs"), completed);
    }

    // Start new task
    const newTask = {
      employeeId,
      task,
      department,
      startTime: now.toISOString(),
      endTime: null
    };

    setCurrentTasks(prev => ({ ...prev, [employeeId]: newTask }));
    await addDoc(collection(db, "taskLogs"), newTask);

    // Reset user back to scan
    setEmployeeId("");
    setIsAdmin(false);
    setShowLive(false);
  };

  const getDuration = (task) => {
    const start = new Date(task.startTime);
    const end = task.endTime ? new Date(task.endTime) : new Date();
    const diff = Math.floor((end - start) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const exportCSV = (rows) => {
    if (rows.length === 0) return;
    const enriched = rows.map(r => ({ ...r, duration: getDuration(r) }));
    const headers = Object.keys(enriched[0]).join(",");
    const body = enriched.map(r =>
      Object.values(r).map(v => `"${v}"`).join(",")
    );
    const csv = [headers, ...body].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "task-report.csv";
    a.click();
  };

  return (
    <div id="root">
      
      {/* ------------------ TITLE & INPUT AREA ------------------ */}
      <div className={isCentered ? "center-screen" : "top-screen"}>
        <h1>Task Tracker</h1>

        {!isAdmin && (
          <input
            placeholder="Scan Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value.toLowerCase())}
            autoFocus
          />
        )}
      </div>

      {/* ------------------ ADMIN MODE ------------------ */}
      {isAdmin && (
        <div style={{ textAlign: "center" }}>
          <h2>ADMIN MODE ({employeeId})</h2>
          <div className="admin-buttons">
            <button onClick={() => setShowLive(v => !v)}>
              {showLive ? "Hide Live View" : "View Live"}
            </button>

            <button
              onClick={() =>
                exportCSV([...taskLogs, ...Object.values(currentTasks)])
              }
            >
              Download CSV
            </button>

            <button className="exit-admin" onClick={exitAdminMode}>
              Exit Admin Mode
            </button>
          </div>

        </div>
      )}

      {/* ------------------ LIVE VIEW ------------------ */}
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

      {/* ------------------ EMPLOYEE TASK BUTTONS ------------------ */}
      {!isAdmin && employeeId && (
        <div className="task-grid">
          {DEPARTMENT_ORDER.map(dep => (
            <div className="task-group" key={dep}>
              <h3>{dep}</h3>
              <div className="task-buttons">
                {DEPARTMENTS[dep].map(task => (
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
