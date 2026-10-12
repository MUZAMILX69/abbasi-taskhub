import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Layers, LayoutDashboard, ClipboardList, BarChart3, Bell,
  CalendarDays, Flag, CheckCircle2, Undo2, PlusCircle,
  AlertTriangle, CircleDot, User, X, LogOut, Clock, History,
  Users, FileText, UserCog, ChevronRight, Search, Pencil, Trash2,
} from "lucide-react";
import "./App.css";
import {
  registerWorker, showMobileNotification, enableMobileNotifications,
  removePushSubscription, hasSavedPushSubscription,
} from "./notifications.js";

// ==========================================
// 🌐 SUPABASE CONNECTION
// ==========================================
const supabaseUrl = "https://ybjqqyocjfdnwejxkwwz.supabase.co";
const supabaseKey = "sb_publishable_1WPQm2LeVf20AVYGy2LR6A_9qKl7VH0";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
// ==========================================

const PRIORITY_WEIGHT = { extreme: 3, high: 2, normal: 1 };
const PRIORITY_LABEL = { extreme: "Extreme Urgent", high: "High", normal: "Normal" };

// Helper to fix Supervisor/Admin casing issues
const getRole = (role) => (role || "").toLowerCase().trim();

function formatDate(v) { return v ? new Date(v).toLocaleDateString() : "No date"; }
function formatDateTime(v) { return v ? new Date(v).toLocaleString() : "-"; }

function PriorityPill({ priority }) {
  return (
    <span className={`priority-pill ${priority}`}>
      {priority === "extreme" && <AlertTriangle size={13} />}
      {priority === "high" && <Flag size={13} />}
      {priority === "normal" && <CircleDot size={13} />}
      {PRIORITY_LABEL[priority] || priority}
    </span>
  );
}

function StatusPill({ status }) {
  if (status === "completed") return (<span className="status-pill completed"><CheckCircle2 size={13} /> Completed</span>);
  if (status === "reversed") return (<span className="status-pill reversed"><Undo2 size={13} /> Reversed</span>);
  return (<span className="status-pill pending"><Clock size={13} /> Pending</span>);
}

export default function App() {
  // ---------- AUTH & PROFILE STATES ----------
  const [session, setSession] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [profileIssue, setProfileIssue] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [name, setName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // ---------- APP STATES ----------
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("dashboard");
  const [selectedTask, setSelectedTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [actionNote, setActionNote] = useState("");
  const [notification, setNotification] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // ---------- FILTERS & FORMS ----------
  const [searchTerm, setSearchTerm] = useState("");
  const [reportUser, setReportUser] = useState("all");
  const [reportSearch, setReportSearch] = useState("");
  const [reportSort, setReportSort] = useState("newest");
  const [newTask, setNewTask] = useState({ title: "", detail: "", priority: "normal", assignee_id: "", due_date: "" });

  // ---------- PROFILE SETTINGS ----------
  const [profileName, setProfileName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPushEnabled(false);
    if (currentUser) {
      hasSavedPushSubscription(supabase, currentUser.id)
        .then((enabled) => { if (!cancelled) setPushEnabled(enabled); })
        .catch(() => { if (!cancelled) setPushEnabled(false); });
    }
    return () => { cancelled = true; };
  }, [currentUser]);

  const enableNotifications = async () => {
    setNotificationBusy(true);
    setNotificationStatus("");
    try {
      const result = await enableMobileNotifications(supabase, currentUser.id);
      setPushEnabled(result.background);
      await showMobileNotification("Abbasi TaskHub Test", {
        body: "Mobile notifications are working on this device.",
        tag: "abbasi-notification-test",
      });
      setNotificationStatus(result.message);
    } catch (error) {
      console.error("Notification setup:", error);
      setNotificationStatus(error.message || "Unable to enable notifications.");
    } finally {
      setNotificationBusy(false);
    }
  };

  // ---------- ADMIN USER MANAGEMENT ----------
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "employee" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState(null);

  const myRole = getRole(currentUser?.role);
  const canManage = !!currentUser && (myRole === "admin" || myRole === "supervisor");
  const canDelete = !!currentUser && myRole === "admin";

  const showNotification = (message) => {
    setNotification({ id: Date.now(), message });
    setTimeout(() => setNotification(null), 4500);
  };

  const handleApiError = (error) => {
    if (!error) return false;
    if (/jwt expired|invalid jwt|session expired|refresh token/i.test(error.message || "")) {
      supabase.auth.signOut();
      setAuthInfo("Your session expired. Please sign in again.");
      return true;
    }
    console.error(error);
    return false;
  };

  // ---------- SESSION & KEEP ALIVE ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refresh = () => { supabase.auth.refreshSession().catch(() => {}); };
    refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(refresh, 10 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(timer); };
  }, []);

  // ---------- LOAD PROFILE ----------
  useEffect(() => {
    if (!session?.user) { setCurrentUser(null); setProfileIssue(""); return; }
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("users").select("*").eq("id", session.user.id).maybeSingle();
      if (error && handleApiError(error)) return;
      if (data) { if (active) { setCurrentUser(data); setProfileIssue(""); } return; }
      const fallbackName = session.user.user_metadata?.name || session.user.email.split("@")[0];
      await supabase.from("users").insert({ id: session.user.id, name: fallbackName, email: session.user.email, role: "employee" });
      const { data: retry } = await supabase.from("users").select("*").eq("id", session.user.id).maybeSingle();
      if (active) { setCurrentUser(retry); if (!retry) setProfileIssue("Could not load profile."); }
    })();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (currentUser) { setProfileName(currentUser.name || ""); setNewPassword(""); setProfileMsg(null); }
  }, [currentUser?.id]);

  // ---------- AUTH HANDLERS ----------
  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError(""); setAuthInfo(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim().toLowerCase(), password });
    setLoading(false); if (error) setAuthError(error.message);
  };

  const handleSignup = async (e) => {
    e.preventDefault(); setAuthError(""); setAuthInfo(""); setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: loginEmail.trim().toLowerCase(), password, options: { data: { name: name.trim() } } });
    setLoading(false);
    if (error) { setAuthError(error.message); return; }
    if (!data.session) { setAuthInfo("Account created! Check email to confirm."); setAuthMode("login"); }
  };

  const logout = async () => {
    try {
      await removePushSubscription(supabase, currentUser.id);
    } catch (error) {
      setProfileMsg({ type: "error", text: `Could not disable this device's alerts: ${error.message}. Please retry signing out.` });
      setView("profile");
      return;
    }
    await supabase.auth.signOut();
    setCurrentUser(null); setTasks([]); setView("dashboard"); setSelectedTask(null); setEditTask(null);
  };

  // ---------- PROFILE HANDLERS ----------
  const saveProfileName = async () => {
    const clean = profileName.trim(); if (!clean) return;
    setSaving(true);
    const { error } = await supabase.from("users").update({ name: clean }).eq("id", currentUser.id);
    setSaving(false);
    if (error) { setProfileMsg({ type: "error", text: error.message }); return; }
    setCurrentUser({ ...currentUser, name: clean });
    setProfileMsg({ type: "success", text: "✅ Name updated." });
    fetchUsers();
  };

  const changePassword = async () => {
    if (newPassword.length < 6) { setProfileMsg({ type: "error", text: "Password must be at least 6 characters." }); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) { setProfileMsg({ type: "error", text: error.message }); return; }
    setNewPassword("");
    setProfileMsg({ type: "success", text: "✅ Password changed successfully." });
  };

  // ---------- DATA FETCHING ----------
  const fetchUsers = async () => {
    const { data, error } = await supabase.from("users").select("*").order("name");
    if (error) { handleApiError(error); return; }
    setUsers(data || []);
  };

  const fetchTasks = async (user = currentUser) => {
    if (!user) return;
    let query = supabase.from("tasks").select("*");
    if (getRole(user.role) === "employee") query = query.eq("assignee_id", user.id);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) { handleApiError(error); return; }
    setTasks(data || []);
  };

  useEffect(() => {
    if (!currentUser) return;
    fetchUsers();
    fetchTasks(currentUser);
    registerWorker().catch((error) => console.error("Service worker:", error));

    const channel = supabase.channel(`abbasi-taskhub-${currentUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        const assignedToMe = payload.new?.assignee_id === currentUser.id;
        const newAssignment = payload.eventType === "INSERT" ||
          (payload.eventType === "UPDATE" && payload.old?.assignee_id != null &&
            payload.old.assignee_id !== payload.new?.assignee_id);
        if (assignedToMe && newAssignment) {
          showNotification(`🔔 New task: ${payload.new.title}`);
          // Once push is configured, the server is the only system-alert sender.
          // Realtime remains responsible for refreshing the open app.
          if (!pushEnabled) {
            showMobileNotification("Abbasi TaskHub", {
              body: `Assigned to you: ${payload.new.title}`,
              tag: `abbasi-task-${payload.new.id}`,
            }).catch((error) => console.error("Task notification:", error));
          }
        }
        fetchTasks(currentUser);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") fetchTasks(currentUser);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Task realtime connection:", status);
        }
      });
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") fetchTasks(currentUser);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      supabase.removeChannel(channel);
    };
  }, [currentUser, pushEnabled]);

  const getUserName = (id) => users.find((u) => u.id === id)?.name || "Unknown";

  // ---------- FILTERS & SORTING ----------
  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === "pending").sort((a, b) => {
    const diff = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    if (diff !== 0) return diff;
    return new Date(a.due_date || "2999-12-31") - new Date(b.due_date || "2999-12-31");
  }), [tasks]);

  const historyTasks = useMemo(() => tasks.filter((t) => t.status !== "pending").sort((a, b) =>
    new Date(b.completed_at || b.reversed_at || 0) - new Date(a.completed_at || a.reversed_at || 0)
  ), [tasks]);

  const matchesSearch = (task) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return task.title.toLowerCase().includes(q) || (task.detail || "").toLowerCase().includes(q) || getUserName(task.assignee_id).toLowerCase().includes(q);
  };
  const visiblePending = useMemo(() => pendingTasks.filter(matchesSearch), [pendingTasks, searchTerm, users]);
  const visibleHistory = useMemo(() => historyTasks.filter(matchesSearch), [historyTasks, searchTerm, users]);

  const reportData = useMemo(() => {
    const chosen = users.filter((u) => getRole(u.role) !== "admin" && (reportUser === "all" || u.id === reportUser));
    const match = (task) => { const q = reportSearch.trim().toLowerCase(); return !q || task.title.toLowerCase().includes(q) || (task.detail || "").toLowerCase().includes(q); };
    const sortFn = (a, b) => {
      if (reportSort === "priority") return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      const at = new Date(a.completed_at || a.reversed_at || a.created_at || 0).getTime();
      const bt = new Date(b.completed_at || b.reversed_at || b.created_at || 0).getTime();
      return reportSort === "oldest" ? at - bt : bt - at;
    };
    return chosen.map((user) => {
      const t = tasks.filter((task) => task.assignee_id === user.id);
      return { user, total: t.length, pending: t.filter((x) => x.status === "pending").length, completed: t.filter((x) => x.status === "completed").length, reversed: t.filter((x) => x.status === "reversed").length, completedTasks: t.filter((x) => x.status === "completed" && match(x)).sort(sortFn), reversedTasks: t.filter((x) => x.status === "reversed" && match(x)).sort(sortFn) };
    });
  }, [users, tasks, reportUser, reportSearch, reportSort]);

  // ---------- TASK ACTIONS ----------
  const handleCreateTask = async (e) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from("tasks").insert({ title: newTask.title.trim(), detail: newTask.detail.trim(), priority: newTask.priority, status: "pending", assignee_id: newTask.assignee_id, creator_id: currentUser.id, due_date: newTask.due_date || null });
    setSaving(false); if (error) { alert(error.message); return; }
    setNewTask({ title: "", detail: "", priority: "normal", assignee_id: "", due_date: "" }); setView("dashboard"); showNotification("✅ Task assigned.");
  };

  const openEdit = (task) => { setSelectedTask(null); setEditTask({ id: task.id, title: task.title, detail: task.detail || "", priority: task.priority, assignee_id: task.assignee_id || "", due_date: task.due_date ? String(task.due_date).slice(0, 10) : "" }); };
  const saveEdit = async () => {
    setSaving(true);
    const { error } = await supabase.from("tasks").update({ title: editTask.title.trim(), detail: editTask.detail.trim(), priority: editTask.priority, assignee_id: editTask.assignee_id || null, due_date: editTask.due_date || null }).eq("id", editTask.id);
    setSaving(false); if (error) { alert(error.message); return; }
    setEditTask(null); showNotification("✏️ Task updated.");
  };

  const deleteTask = async (id) => {
    if (!window.confirm("Delete this task permanently?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setSelectedTask(null); showNotification("🗑️ Task deleted.");
  };

  const closeModal = () => { setSelectedTask(null); setActionNote(""); };
  const completeTask = async () => {
    setSaving(true);
    const { error } = await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString(), result_note: actionNote.trim() }).eq("id", selectedTask.id);
    setSaving(false); if (error) { alert(error.message); return; }
    showNotification("✅ Task completed."); closeModal();
  };
  const reverseTask = async () => {
    setSaving(true);
    const { error } = await supabase.from("tasks").update({ status: "reversed", reversed_at: new Date().toISOString(), reversal_reason: actionNote.trim() }).eq("id", selectedTask.id);
    setSaving(false); if (error) { alert(error.message); return; }
    showNotification("⚠️ Task reversed."); closeModal();
  };

  // ---------- ADMIN USER ACTIONS ----------
  const handleCreateUser = async (e) => {
    e.preventDefault(); setCreatingUser(true); setUserMsg(null);
    try {
      const tempClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await tempClient.auth.signUp({ email: newUser.email.trim().toLowerCase(), password: newUser.password, options: { data: { name: newUser.name.trim() } } });
      if (error) { setUserMsg({ type: "error", text: error.message }); return; }
      if (!data.user) { setUserMsg({ type: "error", text: "Could not create user." }); return; }
      const { error: roleError } = await supabase.from("users").update({ role: newUser.role, name: newUser.name.trim() }).eq("id", data.user.id);
      if (roleError) { setUserMsg({ type: "error", text: "Role update failed: " + roleError.message }); return; }
      setUserMsg({ type: "success", text: `✅ User ${newUser.email} created!` });
      setNewUser({ name: "", email: "", password: "", role: "employee" }); fetchUsers();
    } catch (err) { setUserMsg({ type: "error", text: String(err.message || err) }); } finally { setCreatingUser(false); }
  };

  const changeRole = async (userId, role) => {
    const { error } = await supabase.from("users").update({ role }).eq("id", userId);
    if (error) alert(error.message); else fetchUsers();
  };

  // ---------- RENDER: LOGIN ----------
  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card fade-in">
          <div className="auth-logo"><Layers size={30} /></div>
          <h1>Abbasi TaskHub</h1><p>Abbasi Card House</p>
          {authError && <div className="auth-error">{authError}</div>}
          {authInfo && <div className="auth-warning">{authInfo}</div>}
          <form onSubmit={authMode === "login" ? handleLogin : handleSignup} className="auth-form">
            {authMode === "signup" && <div className="field"><label>Full Name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>}
            <div className="field"><label>Email</label><input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button className="btn btn-primary" disabled={loading}>{loading ? "Please wait..." : authMode === "login" ? "Sign In" : "Create Account"}</button>
          </form>
          <button className="link-button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); setAuthInfo(""); }}>
            {authMode === "login" ? "New employee? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- RENDER: LOADING ----------
  if (!currentUser) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo"><Layers size={30} /></div>
          <h1>Loading your profile...</h1>
          {profileIssue && <div className="auth-error" style={{ marginTop: 15 }}>{profileIssue}</div>}
        </div>
      </div>
    );
  }

  const canComplete = selectedTask?.status === "pending" && selectedTask?.assignee_id === currentUser.id;
  const canReverse = selectedTask?.status === "completed" && selectedTask?.assignee_id === currentUser.id;

  const renderRow = (task, dateValue) => (
    <article key={task.id} className={`task-row priority-${task.priority}`} onClick={() => setSelectedTask(task)}>
      <div className="row-main">
        <div className="row-title-line">
          <h3>{task.title}</h3>
          <PriorityPill priority={task.priority} />
          <StatusPill status={task.status} />
        </div>
        <p>{task.detail}</p>
      </div>
      <div className="row-side">
        <span><User size={14} /> {getUserName(task.assignee_id)}</span>
        <span><CalendarDays size={14} /> {formatDate(dateValue)}</span>
      </div>
      {canManage && (
        <div className="row-actions">
          <button className="icon-btn small" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(task); }}><Pencil size={15} /></button>
          {canDelete && <button className="icon-btn small danger" title="Delete" onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}><Trash2 size={15} /></button>}
        </div>
      )}
      <ChevronRight size={18} className="row-chevron" />
    </article>
  );

  // ---------- RENDER: MAIN APP ----------
  return (
    <div className="app-shell">
      {notification && <div className="toast-notification" key={notification.id}><Bell size={16} /> {notification.message}</div>}

      <header className="header">
        <div className="logo">
          <div className="logo-icon"><Layers size={22} /></div>
          <div className="logo-text"><h1>Abbasi TaskHub</h1><p>Abbasi Card House</p></div>
        </div>
        <div className="user-info">
          <span className="role-badge">{currentUser.role}</span>
          <span className="user-name">{currentUser.name}</span>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar">
          <button className={`sidebar-button ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}><LayoutDashboard size={18} /> Dashboard</button>
          {canManage && <button className={`sidebar-button ${view === "create" ? "active" : ""}`} onClick={() => setView("create")}><PlusCircle size={18} /> Assign Task</button>}
          {canManage && <button className={`sidebar-button ${view === "reports" ? "active" : ""}`} onClick={() => setView("reports")}><BarChart3 size={18} /> Reports</button>}
          {myRole === "admin" && <button className={`sidebar-button ${view === "users" ? "active" : ""}`} onClick={() => setView("users")}><UserCog size={18} /> Team Users</button>}
          <button className={`sidebar-button ${view === "profile" ? "active" : ""}`} onClick={() => setView("profile")}><User size={18} /> My Profile</button>
          <div className="sidebar-footer"><button className="sidebar-button logout" onClick={logout}><LogOut size={18} /> Logout</button></div>
        </aside>

        <main className="content">
          {/* ===== DASHBOARD ===== */}
          {view === "dashboard" && (
            <section className="fade-in">
              <div className="page-title"><ClipboardList size={24} /><div><h2>Dashboard</h2><p>{myRole === "employee" ? "Your assigned tasks" : "All team tasks"}</p></div></div>
              <div className="search-bar"><Search size={18} /><input placeholder="Search tasks..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />{searchTerm && <button className="icon-btn small" onClick={() => setSearchTerm("")}><X size={15} /></button>}</div>
              <div className="section-title"><Clock size={18} /><h3>Pending ({visiblePending.length})</h3></div>
              {visiblePending.length === 0 ? <div className="empty-state"><ClipboardList size={30} /><p>No pending tasks.</p></div> : <div className="task-list">{visiblePending.map((task) => renderRow(task, task.due_date))}</div>}
              <div className="section-title" style={{ marginTop: 35 }}><History size={18} /><h3>History ({visibleHistory.length})</h3></div>
              {visibleHistory.length === 0 ? <div className="empty-state"><History size={30} /><p>No history yet.</p></div> : <div className="task-list">{visibleHistory.map((task) => renderRow(task, task.completed_at || task.reversed_at))}</div>}
            </section>
          )}

          {/* ===== ASSIGN TASK ===== */}
          {view === "create" && canManage && (
            <section className="fade-in">
              <div className="page-title"><PlusCircle size={24} /><div><h2>Assign New Task</h2><p>Create and assign a task</p></div></div>
              <form className="form-card" onSubmit={handleCreateTask}>
                <div className="field"><label>Task Title</label><input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} required /></div>
                <div className="field"><label>Task Detail</label><textarea value={newTask.detail} onChange={(e) => setNewTask({ ...newTask, detail: e.target.value })} required /></div>
                <div className="form-grid">
                  <div className="field"><label>Assign To</label><select value={newTask.assignee_id} onChange={(e) => setNewTask({ ...newTask, assignee_id: e.target.value })} required><option value="">Select person</option>{users.filter((u) => getRole(u.role) !== "admin").map((u) => (<option key={u.id} value={u.id}>{u.name} ({u.role})</option>))}</select></div>
                  <div className="field"><label>Priority</label><select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="extreme">Extreme Urgent</option></select></div>
                </div>
                <div className="field"><label>Expected Finish Date</label><input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} required /></div>
                <button className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Assign Task"}</button>
              </form>
            </section>
          )}

          {/* ===== REPORTS ===== */}
          {view === "reports" && canManage && (
            <section className="fade-in">
              <div className="page-title"><BarChart3 size={24} /><div><h2>Employee Reports</h2><p>Completed and reversed details</p></div></div>
              <div className="report-filters">
                <div className="field"><label>Employee</label><select value={reportUser} onChange={(e) => setReportUser(e.target.value)}><option value="all">All Employees</option>{users.filter((u) => getRole(u.role) !== "admin").map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}</select></div>
                <div className="field"><label>Search Task</label><input type="text" placeholder="Search..." value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} /></div>
                <div className="field"><label>Sort By</label><select value={reportSort} onChange={(e) => setReportSort(e.target.value)}><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="priority">Priority</option></select></div>
              </div>
              <div className="reports-list">
                {reportData.map((item) => (
                  <div key={item.user.id} className="report-card full">
                    <div className="report-head"><Users size={18} /><div><h3>{item.user.name}</h3><p>{item.user.email}</p></div><span className="role-badge">{item.user.role}</span></div>
                    <div className="stat-grid">
                      <div className="stat"><span className="stat-number total">{item.total}</span><span>Total</span></div>
                      <div className="stat"><span className="stat-number pending">{item.pending}</span><span>Pending</span></div>
                      <div className="stat"><span className="stat-number completed">{item.completed}</span><span>Done</span></div>
                      <div className="stat"><span className="stat-number reversed">{item.reversed}</span><span>Reversed</span></div>
                    </div>
                    <div className="report-tasks">
                      <h4>✅ Completed Tasks</h4>
                      {item.completedTasks.length === 0 ? <p className="muted">None.</p> : item.completedTasks.map((t) => (<div key={t.id} className="report-task-row done"><CheckCircle2 size={15} /><div><strong>{t.title}</strong><span>{formatDateTime(t.completed_at)}{t.result_note ? ` — ${t.result_note}` : ""}</span></div></div>))}
                      <h4>⚠️ Reversed Tasks</h4>
                      {item.reversedTasks.length === 0 ? <p className="muted">None.</p> : item.reversedTasks.map((t) => (<div key={t.id} className="report-task-row rev"><Undo2 size={15} /><div><strong>{t.title}</strong><span>{formatDateTime(t.reversed_at)}{t.reversal_reason ? ` — ${t.reversal_reason}` : ""}</span></div></div>))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ===== TEAM USERS ===== */}
          {view === "users" && myRole === "admin" && (
            <section className="fade-in">
              <div className="page-title"><UserCog size={24} /><div><h2>Team Users</h2><p>Create and manage</p></div></div>
              {userMsg && <div className={userMsg.type === "success" ? "auth-warning" : "auth-error"} style={{ maxWidth: 750, marginBottom: 15 }}>{userMsg.text}</div>}
              <form className="form-card" onSubmit={handleCreateUser}>
                <div className="form-grid">
                  <div className="field"><label>Full Name</label><input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required /></div>
                  <div className="field"><label>Email</label><input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></div>
                </div>
                <div className="form-grid">
                  <div className="field"><label>Password</label><input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} minLength={6} required /></div>
                  <div className="field"><label>Role</label><select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>
                </div>
                <button className="btn btn-primary" disabled={creatingUser}>{creatingUser ? "Creating..." : "Create User"}</button>
              </form>
              <div className="section-title" style={{ marginTop: 30 }}><Users size={18} /><h3>All Users</h3></div>
              <div className="reports-grid">
                {users.map((u) => (
                  <div key={u.id} className="report-card">
                    <div className="report-head"><User size={18} /><div><h3>{u.name}</h3><p>{u.email}</p></div><span className="role-badge">{u.role}</span></div>
                    {u.id !== currentUser.id && <div className="field"><label>Change Role</label><select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}><option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></div>}
                  </div>
                ))}
              </div>
            </section>
          )}
{/* ===== PROFILE ===== */}
{view === "profile" && (
  <section className="fade-in">
    <div className="page-title">
      <User size={24} />
      <div>
        <h2>My Profile</h2>
        <p>Update your display name and password</p>
      </div>
    </div>

    {profileMsg && (
      <div
        className={
          profileMsg.type === "success" ? "auth-warning" : "auth-error"
        }
        style={{ maxWidth: 600, marginBottom: 15 }}
      >
        {profileMsg.text}
      </div>
    )}

    <form
      className="form-card"
      onSubmit={(e) => {
        e.preventDefault();
        saveProfileName();
      }}
    >
      <div className="field">
        <label>Email (cannot be changed)</label>
        <input value={currentUser.email} disabled />
      </div>

      <div className="field">
        <label>Role (managed by Admin)</label>
        <input value={currentUser.role} disabled />
      </div>

      <div className="field">
        <label>Display Name</label>
        <input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          required
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Name"}
      </button>
    </form>

    <form
      className="form-card"
      style={{ marginTop: 20 }}
      onSubmit={(e) => {
        e.preventDefault();
        changePassword();
      }}
    >
      <div className="field">
        <label>New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Minimum 6 characters"
          minLength={6}
          required
        />
      </div>

      <button
        type="submit"
        className="btn btn-success"
        disabled={saving}
      >
        {saving ? "Saving..." : "Change Password"}
      </button>
    </form>

    <div className="form-card" style={{ marginTop: 20 }}>
      <div className="field">
        <label>Mobile Notifications</label>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 10 }}>
          {pushEnabled
            ? "This device is subscribed for background task alerts."
            : "Enable notifications on this device. Background alerts need the server setup in the supplied guide."}
        </p>
        <button type="button" className="btn btn-primary"
          disabled={notificationBusy} onClick={enableNotifications}>
          {notificationBusy ? "Setting up..." : "Enable / Test Notifications"}
        </button>
        {notificationStatus && <p role="status" style={{ marginTop: 12 }}>{notificationStatus}</p>}
      </div>
    </div>
  </section>
)}
</main>
</div>
      {/* ===== TASK VIEW MODAL ===== */}
      {selectedTask && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><div><h3>{selectedTask.title}</h3><p>Details & Actions</p></div><button className="icon-btn" onClick={closeModal}><X size={18} /></button></div>
            <div className="modal-badges"><PriorityPill priority={selectedTask.priority} /><StatusPill status={selectedTask.status} /></div>
            <p className="modal-detail">{selectedTask.detail}</p>
            <div className="meta-grid">
              <div><span>Assigned To</span><strong>{getUserName(selectedTask.assignee_id)}</strong></div>
              <div><span>Created By</span><strong>{getUserName(selectedTask.creator_id)}</strong></div>
              <div><span>Expected</span><strong>{formatDate(selectedTask.due_date)}</strong></div>
              <div><span>Created</span><strong>{formatDateTime(selectedTask.created_at)}</strong></div>
              {selectedTask.completed_at && <div><span>Completed</span><strong>{formatDateTime(selectedTask.completed_at)}</strong></div>}
              {selectedTask.reversed_at && <div><span>Reversed</span><strong>{formatDateTime(selectedTask.reversed_at)}</strong></div>}
            </div>
            {selectedTask.result_note && <div className="note-box success-box"><FileText size={16} /><div><strong>Note</strong><p>{selectedTask.result_note}</p></div></div>}
            {selectedTask.reversal_reason && <div className="note-box danger-box"><Undo2 size={16} /><div><strong>Reason</strong><p>{selectedTask.reversal_reason}</p></div></div>}
            {canComplete && (<div className="action-section"><label>Result Note</label><textarea placeholder="What did you complete?" value={actionNote} onChange={(e) => setActionNote(e.target.value)} /><button className="btn btn-success" onClick={completeTask} disabled={!actionNote.trim() || saving}>{saving ? "Saving..." : "Mark Completed"}</button></div>)}
            {canReverse && (<div className="action-section"><label>Reverse Reason</label><textarea placeholder="Why reverse?" value={actionNote} onChange={(e) => setActionNote(e.target.value)} /><button className="btn btn-danger" onClick={reverseTask} disabled={!actionNote.trim() || saving}>{saving ? "Saving..." : "Reverse Task"}</button></div>)}
            {canManage && (<div className="modal-actions"><button className="btn btn-primary" onClick={() => openEdit(selectedTask)}><Pencil size={16} /> Edit</button>{canDelete && <button className="btn btn-danger" onClick={() => deleteTask(selectedTask.id)}><Trash2 size={16} /> Delete</button>}</div>)}
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
      {editTask && (
        <div className="modal-overlay" onClick={() => setEditTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><div><h3>Edit Task</h3></div><button className="icon-btn" onClick={() => setEditTask(null)}><X size={18} /></button></div>
            <div className="field"><label>Title</label><input value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} required /></div>
            <div className="field"><label>Detail</label><textarea value={editTask.detail} onChange={(e) => setEditTask({ ...editTask, detail: e.target.value })} /></div>
            <div className="form-grid">
              <div className="field"><label>Assign To</label><select value={editTask.assignee_id} onChange={(e) => setEditTask({ ...editTask, assignee_id: e.target.value })}><option value="">Unassigned</option>{users.filter((u) => getRole(u.role) !== "admin").map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}</select></div>
              <div className="field"><label>Priority</label><select value={editTask.priority} onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="extreme">Extreme</option></select></div>
            </div>
            <div className="field"><label>Date</label><input type="date" value={editTask.due_date} onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })} /></div>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
