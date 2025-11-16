import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc } from "firebase/firestore";

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
    "MHE",
    "ambient decant",
    "ambient decant cleanup",
    "Pallet cleanup",
    "Baler task",
    "chill decant",
    "chill decant cleanup"
  ],
  Freezer: ["freezer decant", "freezer putaway", "freezer pick", "freezer cleanup", "unload and icing trolly"],
  Dispatch: [
    "frameload",
    "MHE",
    "dekit",
    "van loading",
    "dispatch cleanup",
    "van dekit",
    "trailer dekit",
    "trailer loading"
  ]
};

function App() {
  const [employeeId, setEmployeeId] = useState("");
  const [currentTasks, setCurrentTasks] = useState({});
  const [taskLogs, setTaskLogs] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLive, setShowLive] = useState(false);

  const [tick, setTick] = useState(0); // updates durations every second

  // Timer to refresh duration every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Detect admin ONLY after scanning ID
  useEffect(() => {
    if (employeeId.trim() === "") return;
    if (ADMIN_IDS.includes(employeeId)) {
      setIsAdmin(true);
      setShowLive(false);
    }
  }, [employeeId]);

  const exitAdminMode = () => {
    setIsAdmin(false);
    setEmployeeId("");
    setShowLive(false);
  };

  const handleTaskChange = async (task, department) => {
    const now = new Date();

    // If employee has previous unfinished task → finish it
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

    // Reset screen
    setEmployeeId("");
    setIsAdmin(false);
    setShowLive(false);
  };

  const getDuration = (task) => {
    const start = new Date(task.startTime);
    const end = task.endTime ? new Date(task.endTime) : new Date();

    const diff = Math.floor((end - start) / 1000);

    const h = Math.floor(diff / 3600).toString().padStart(2, "0");
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(diff % 60).toString().padStart(2, "0");

    return `${h}:${m}:${s}`;
  };

  const exportCSV = (rows) => {
    if (rows.length === 0) return;

    const enriched = rows.map(r => {
      const start = new Date(r.startTime);
      const end = r.endTime ? new Date(r.endTime) : new Date();
      const diff = Math.floor((end - start) / 1000);

      return {
        ...r,
        duration: getDuration(r)
      };
    });

    const headers = Object.keys(enriched[0]).join(",");
    const body = enriched.map(r =>
      Object.values(r)
        .map(v => `"${v}"`)
        .join(",")
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
    <div style={{ padding: 20 }}>
      <h1>Task Tracker</h1>

      {/* ================== SCAN INPUT ================== */}
      {!isAdmin && (
        <input
          placeholder="Scan Employee ID"
          value={employeeId}
          onChange={e => setEmployeeId(e.target.value.toLowerCase())}
          autoFocus
        />
      )}

      {/* ================== ADMIN MODE ================== */}
      {isAdmin && (
        <div style={{ marginTop: 20 }}>
          <h2>ADMIN MODE ({employeeId})</h2>

          <button onClick={() => setShowLive(v => !v)}>
            {showLive ? "Hide Live View" : "View Live"}
          </button>

          <button
            onClick={() => exportCSV([...taskLogs, ...Object.values(currentTasks)])}
            style={{ marginLeft: 10 }}
          >
            Download CSV
          </button>

          <button
            onClick={exitAdminMode}
            style={{ marginLeft: 10, background: "red", color: "white" }}
          >
            Exit Admin Mode
          </button>
        </div>
      )}

      {/* ================== LIVE VIEW ================== */}
      {isAdmin && showLive && (
        <div style={{ marginTop: 20 }}>
          <h3>Live Tasks</h3>

          <table border="1" cellPadding="6">
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

      {/* ================== EMPLOYEE TASK SELECTION ================== */}
      {!isAdmin && employeeId && (
        <div style={{ marginTop: 20 }}>
          {DEPARTMENT_ORDER.map(dep => (
            <div key={dep} style={{ marginBottom: 20 }}>
              <h3>{dep}</h3>
              {DEPARTMENTS[dep].map(task => (
                <button
                  key={task}
                  onClick={() => handleTaskChange(task, dep)}
                  style={{ margin: 5 }}
                >
                  {task}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
