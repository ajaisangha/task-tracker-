import React, { useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import "./admin.css";

export default function Admin({ onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [loggedIn, setLoggedIn] = useState(false);

  // admin view state
  const [showLive, setShowLive] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // live data
  const [activeTasks, setActiveTasks] = useState([]);

  /* =======================
     LOGIN
  ======================= */
  const login = async () => {
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoggedIn(true);
      setShowLive(true);
      setShowHistory(false);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setError("User not found");
      } else if (err.code === "auth/wrong-password") {
        setError("Wrong password");
      } else {
        setError("Login failed");
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
    setLoggedIn(false);
    onBack();
  };

  /* =======================
     LIVE VIEW FETCH
  ======================= */
  useEffect(() => {
    if (!loggedIn) return;

    const unsub = onSnapshot(collection(db, "activeTasks"), (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push(d.data()));
      setActiveTasks(rows);
    });

    return () => unsub();
  }, [loggedIn]);

  /* =======================
     LOGIN DIALOG
  ======================= */
  if (!loggedIn) {
    return (
      <div className="admin-overlay">
        <div className="admin-dialog">
          <h3>Admin Login</h3>

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="admin-error">{error}</div>}

          <div className="admin-dialog-buttons">
            <button onClick={login}>Login</button>
            <button className="secondary" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =======================
     ADMIN DASHBOARD
  ======================= */
  return (
    <div className="admin-page">
      {/* TOP BAR */}
      <div className="admin-topbar">
        <div className="admin-toggle">
          <button
            className={showLive ? "active" : ""}
            onClick={() => {
              setShowLive(true);
              setShowHistory(false);
            }}
          >
            Live View
          </button>

          <button
            className={showHistory ? "active" : ""}
            onClick={() => {
              setShowHistory(true);
              setShowLive(false);
            }}
          >
            History
          </button>
        </div>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </div>

      {/* LIVE VIEW */}
      {showLive && (
        <div className="admin-section">
          <h2>Live Tasks</h2>

          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Task</th>
                <th>Department</th>
                <th>Start Time</th>
              </tr>
            </thead>
            <tbody>
              {activeTasks.map((t, i) => (
                <tr key={i}>
                  <td>{t.employeeId}</td>
                  <td>{t.task}</td>
                  <td>{t.department}</td>
                  <td>{new Date(t.startTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* HISTORY PLACEHOLDER */}
      {showHistory && (
        <div className="admin-section">
          <h2>History</h2>
          <p>History view will be rendered here.</p>
        </div>
      )}
    </div>
  );
}
