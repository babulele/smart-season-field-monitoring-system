import { useCallback, useEffect, useMemo, useState } from "react";
import { clearToken, request, setToken } from "./api";
import { useSearchParams } from "react-router-dom";

function Login({ onLogin }) {
  const [role, setRole] = useState("ADMIN");
  const [email, setEmail] = useState("admin@smartseason.co");
  const [password, setPassword] = useState("Admin1234");
  const [error, setError] = useState("");

  const applyRolePreset = (nextRole) => {
    setRole(nextRole);
    if (nextRole === "ADMIN") {
      setEmail("admin@smartseason.co");
      setPassword("Admin1234");
    } else {
      setEmail("agent@smartseason.co");
      setPassword("demo1234");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const result = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(result.token);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page center">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-row">
          <span className="brand-badge">⌃</span>
          <div>
            <p className="brand">SmartSeason</p>
            <p className="brand-sub">FIELD MONITOR</p>
          </div>
        </div>
        <h2 className="login-title">Welcome back</h2>
        <p className="login-subtitle">Sign in to your account to continue</p>

        <p className="label">Sign in as</p>
        <div className="role-toggle">
          <button
            type="button"
            className={role === "ADMIN" ? "role-btn active" : "role-btn"}
            onClick={() => applyRolePreset("ADMIN")}
          >
            <span className="role-icon">⌂</span> Admin
          </button>
          <button
            type="button"
            className={role === "AGENT" ? "role-btn active" : "role-btn"}
            onClick={() => applyRolePreset("AGENT")}
          >
            <span className="role-icon">◌</span> Field Agent
          </button>
        </div>

        <label className="label">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="signin-btn" type="submit">
          Sign in &rarr;
        </button>
        {error && <p className="error">{error}</p>}

        <div className="demo-box">
          <p className="demo-title">Demo credentials</p>
          <p>Admin: admin@smartseason.co</p>
          <p>Agent: agent@smartseason.co</p>
          <p>Password: demo1234</p>
        </div>
      </form>
    </div>
  );
}

function Dashboard({ user, token }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [fields, setFields] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState("");
  const [newField, setNewField] = useState({
    name: "",
    cropType: "",
    plantingDate: "",
    currentStage: "PLANTED",
  });
  const [selectedAgent, setSelectedAgent] = useState("");
  const [updateDraft, setUpdateDraft] = useState({});
  const [editFieldId, setEditFieldId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    cropType: "",
    plantingDate: "",
    currentStage: "PLANTED",
  });
  const [showCreateForm, setShowCreateForm] = useState(false);

  const isAdmin = user.role === "ADMIN";
  const adminViews = ["dashboard", "all-fields", "field-agents", "reports", "alerts"];
  const agentViews = ["dashboard", "my-fields", "field-notes"];
  const viewParam = searchParams.get("view");
  const activeView = isAdmin
    ? adminViews.includes(viewParam) ? viewParam : "dashboard"
    : agentViews.includes(viewParam) ? viewParam : "dashboard";

  const setView = (view) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", view);
    setSearchParams(nextParams, { replace: true });
  };

  const load = useCallback(async () => {
    try {
      const dash = await request("/dashboard/summary", {}, token);
      const allFields = await request("/fields", {}, token);
      setSummary(dash);
      setFields(allFields);
      if (isAdmin) {
        const users = await request("/agents", {}, token);
        setAgents(users);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const statusLabel = useMemo(() => summary?.statusBreakdown || {}, [summary]);
  const stageCounts = useMemo(() => {
    return fields.reduce(
      (acc, field) => {
        acc[field.currentStage] = (acc[field.currentStage] || 0) + 1;
        return acc;
      },
      { PLANTED: 0, GROWING: 0, READY: 0, HARVESTED: 0 }
    );
  }, [fields]);

  const assignField = async (fieldId) => {
    if (!selectedAgent) return;
    await request(`/fields/${fieldId}/assign`, {
      method: "POST",
      body: JSON.stringify({ agentId: Number(selectedAgent) }),
    }, token);
    await load();
  };

  const createField = async (event) => {
    event.preventDefault();
    try {
      await request("/fields", { method: "POST", body: JSON.stringify(newField) }, token);
      setNewField({ name: "", cropType: "", plantingDate: "", currentStage: "PLANTED" });
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const beginEditField = (field) => {
    setEditFieldId(field.id);
    setEditDraft({
      name: field.name,
      cropType: field.cropType,
      plantingDate: field.plantingDate?.slice(0, 10) || "",
      currentStage: field.currentStage,
    });
  };

  const saveEditField = async () => {
    if (!editFieldId) return;
    await request(
      `/fields/${editFieldId}`,
      {
        method: "PATCH",
        body: JSON.stringify(editDraft),
      },
      token
    );
    setEditFieldId(null);
    await load();
  };

  const submitUpdate = async (fieldId) => {
    const draft = updateDraft[fieldId];
    if (!draft?.stage || !draft?.note) return;
    await request(`/fields/${fieldId}/updates`, {
      method: "POST",
      body: JSON.stringify({ stage: draft.stage, note: draft.note }),
    }, token);
    setUpdateDraft((prev) => ({ ...prev, [fieldId]: { stage: "GROWING", note: "" } }));
    await load();
  };

  const exportFields = () => {
    const headers = ["Field ID", "Name", "Crop Type", "Planting Date", "Stage", "Status", "Latest Note"];
    const rows = fields.map((f) => [
      f.id,
      f.name,
      f.cropType,
      f.plantingDate?.slice(0, 10) || "",
      f.currentStage,
      f.status,
      f.latestNote || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smartseason-fields-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!summary) return <div className="page">Loading...</div>;

  const statusClass = (status) => {
    if (status === "Active") return "pill active";
    if (status === "AtRisk") return "pill risk";
    return "pill done";
  };

  if (isAdmin) {
    const renderAdminView = () => {
      if (activeView === "all-fields") {
        return (
          <>
            <section className="table-card">
              <h4>Create field</h4>
              <form className="row" onSubmit={createField}>
                <input
                  placeholder="Field name"
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                />
                <input
                  placeholder="Crop type"
                  value={newField.cropType}
                  onChange={(e) => setNewField({ ...newField, cropType: e.target.value })}
                />
                <input
                  type="date"
                  value={newField.plantingDate}
                  onChange={(e) => setNewField({ ...newField, plantingDate: e.target.value })}
                />
                <select
                  value={newField.currentStage}
                  onChange={(e) => setNewField({ ...newField, currentStage: e.target.value })}
                >
                  <option>PLANTED</option>
                  <option>GROWING</option>
                  <option>READY</option>
                  <option>HARVESTED</option>
                </select>
                <button type="submit">Create</button>
              </form>
            </section>

            <section className="table-card">
              <div className="table-head">
                <h4>All fields</h4>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Field name</th>
                    <th>Crop</th>
                    <th>Stage</th>
                    <th>Planted</th>
                    <th>Status</th>
                    <th>Assign agent</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.id}>
                      <td>
                        {editFieldId === field.id ? (
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                          />
                        ) : (
                          field.name
                        )}
                      </td>
                      <td>
                        {editFieldId === field.id ? (
                          <input
                            value={editDraft.cropType}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, cropType: e.target.value }))}
                          />
                        ) : (
                          field.cropType
                        )}
                      </td>
                      <td>
                        {editFieldId === field.id ? (
                          <select
                            value={editDraft.currentStage}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, currentStage: e.target.value }))
                            }
                          >
                            <option>PLANTED</option>
                            <option>GROWING</option>
                            <option>READY</option>
                            <option>HARVESTED</option>
                          </select>
                        ) : (
                          field.currentStage
                        )}
                      </td>
                      <td>
                        {editFieldId === field.id ? (
                          <input
                            type="date"
                            value={editDraft.plantingDate}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, plantingDate: e.target.value }))
                            }
                          />
                        ) : (
                          field.plantingDate?.slice(0, 10)
                        )}
                      </td>
                      <td>
                        <span className={statusClass(field.status)}>{field.status}</span>
                      </td>
                      <td>
                        <div className="assign-inline">
                          <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
                            <option value="">Select</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => assignField(field.id)}>Assign</button>
                        </div>
                      </td>
                      <td>
                        {editFieldId === field.id ? (
                          <div className="assign-inline">
                            <button onClick={saveEditField}>Save</button>
                            <button className="ghost-btn" onClick={() => setEditFieldId(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button className="ghost-btn" onClick={() => beginEditField(field)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        );
      }

      if (activeView === "field-agents") {
        return (
          <section className="table-card">
            <h4>Field agents</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.email}</td>
                    <td>AGENT</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      }

      if (activeView === "reports") {
        return (
          <>
            <section className="kpi-grid">
              <article className="kpi-card">
                <small>Total updates</small>
                <h2>{summary.recentUpdates?.length || 0}</h2>
                <p>Latest 5 activities</p>
              </article>
              <article className="kpi-card">
                <small>Completion rate</small>
                <h2>
                  {summary.totalFields ? Math.round(((statusLabel.Completed || 0) / summary.totalFields) * 100) : 0}%
                </h2>
                <p>Completed vs all fields</p>
              </article>
            </section>
            <section className="table-card">
              <h4>Recent updates</h4>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Stage</th>
                    <th>Note</th>
                    <th>Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.recentUpdates || []).map((item) => (
                    <tr key={item.id}>
                      <td>#{item.field_id}</td>
                      <td>{item.stage}</td>
                      <td>{item.note}</td>
                      <td>{item.agent_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        );
      }

      if (activeView === "alerts") {
        const atRisk = fields.filter((f) => f.status === "AtRisk");
        return (
          <section className="table-card">
            <h4>At-risk fields</h4>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Crop</th>
                  <th>Stage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((field) => (
                  <tr key={field.id}>
                    <td>{field.name}</td>
                    <td>{field.cropType}</td>
                    <td>{field.currentStage}</td>
                    <td>
                      <span className="pill risk">AtRisk</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      }

      return (
        <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <small>Total fields</small>
              <h2>{summary.totalFields}</h2>
              <p>{agents.length} agents assigned</p>
            </article>
            <article className="kpi-card">
              <small>Active</small>
              <h2>{statusLabel.Active || 0}</h2>
              <p>In-season fields</p>
            </article>
            <article className="kpi-card">
              <small>At risk</small>
              <h2>{statusLabel.AtRisk || 0}</h2>
              <p>Needs attention</p>
            </article>
            <article className="kpi-card">
              <small>Completed</small>
              <h2>{statusLabel.Completed || 0}</h2>
              <p>Harvested this season</p>
            </article>
          </section>

          <section className="insight-grid">
            <article className="panel-card">
              <h4>Fields by stage</h4>
              <div className="stat-row"><span>Planted</span><b>{stageCounts.PLANTED}</b></div>
              <div className="stat-row"><span>Growing</span><b>{stageCounts.GROWING}</b></div>
              <div className="stat-row"><span>Ready</span><b>{stageCounts.READY}</b></div>
              <div className="stat-row"><span>Harvested</span><b>{stageCounts.HARVESTED}</b></div>
            </article>
            <article className="panel-card">
              <h4>Status breakdown</h4>
              <div className="donut-wrap">
                <div className="donut">{summary.totalFields}</div>
                <div className="legend">
                  <p><span className="dot active" /> Active {statusLabel.Active || 0}</p>
                  <p><span className="dot risk" /> At risk {statusLabel.AtRisk || 0}</p>
                  <p><span className="dot done" /> Completed {statusLabel.Completed || 0}</p>
                </div>
              </div>
            </article>
          </section>

          {showCreateForm && (
            <section className="table-card">
              <h4>Create new field</h4>
              <form className="row" onSubmit={createField}>
                <input
                  placeholder="Field name"
                  required
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                />
                <input
                  placeholder="Crop type"
                  required
                  value={newField.cropType}
                  onChange={(e) => setNewField({ ...newField, cropType: e.target.value })}
                />
                <input
                  type="date"
                  required
                  value={newField.plantingDate}
                  onChange={(e) => setNewField({ ...newField, plantingDate: e.target.value })}
                />
                <select
                  value={newField.currentStage}
                  onChange={(e) => setNewField({ ...newField, currentStage: e.target.value })}
                >
                  <option>PLANTED</option>
                  <option>GROWING</option>
                  <option>READY</option>
                  <option>HARVESTED</option>
                </select>
                <button type="submit">Create</button>
                <button type="button" className="ghost-btn" onClick={() => setShowCreateForm(false)}>Cancel</button>
              </form>
            </section>
          )}
        </>
      );
    };

    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="side-brand">
            <span className="side-dot">⌃</span>
            <div>
              <p>SmartSeason</p>
              <small>FIELD MONITOR</small>
            </div>
            <span className="role-badge admin-badge">⌂ ADMIN</span>
          </div>
          <div className="side-section">
            <p className="side-title">Overview</p>
          <button
            className={activeView === "dashboard" ? "side-link active" : "side-link"}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={activeView === "all-fields" ? "side-link active" : "side-link"}
            onClick={() => setView("all-fields")}
          >
            All Fields
          </button>
          <button
            className={activeView === "field-agents" ? "side-link active" : "side-link"}
            onClick={() => setView("field-agents")}
          >
            Field Agents
          </button>
          </div>
          <div className="side-section">
            <p className="side-title">Monitoring</p>
          <button
            className={activeView === "reports" ? "side-link active" : "side-link"}
            onClick={() => setView("reports")}
          >
            Reports
          </button>
          <button
            className={activeView === "alerts" ? "side-link active" : "side-link"}
            onClick={() => setView("alerts")}
          >
            Alerts
          </button>
          </div>
          <button
            className="side-logout"
            onClick={() => {
              clearToken();
              window.location.reload();
            }}
          >
            Logout
          </button>
        </aside>

        <main className="admin-main">
          <header className="admin-header">
            <div>
              <div className="header-title-row">
                <h3>Season overview</h3>
                <span className="role-badge admin-badge">ADMIN ACCOUNT</span>
              </div>
              <p>April 2026 - field activities across 6 agents</p>
            </div>
            <div className="admin-actions">
              <button className="ghost-btn" onClick={exportFields}>Export</button>
              <button className="dark-btn" onClick={() => setShowCreateForm(!showCreateForm)}>+ Add field</button>
            </div>
          </header>

          {error && <p className="error">{error}</p>}
          {renderAdminView()}
        </main>
      </div>
    );
  }

  const progressForStage = (stage) => {
    if (stage === "PLANTED") return 10;
    if (stage === "GROWING") return 55;
    if (stage === "READY") return 80;
    return 100;
  };

  const [focusField] = fields;
  const focusDraft = focusField ? updateDraft[focusField.id] || { stage: "GROWING", note: "" } : null;

  const renderAgentView = () => {
    if (activeView === "my-fields") {
      return (
        <section className="table-card">
          <h4>My fields</h4>
          <div className="agent-cards">
            {fields.map((field) => {
              const draft = updateDraft[field.id] || { stage: "GROWING", note: "" };
              return (
                <article key={field.id} className="agent-field-card">
                  <h5>{field.name}</h5>
                  <p className="muted-line">{field.cropType} • Planted {field.plantingDate?.slice(0, 10)}</p>
                  <div className="row">
                    <select
                      value={draft.stage}
                      onChange={(e) =>
                        setUpdateDraft((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] || {}), stage: e.target.value },
                        }))
                      }
                    >
                      <option>PLANTED</option>
                      <option>GROWING</option>
                      <option>READY</option>
                      <option>HARVESTED</option>
                    </select>
                    <input
                      placeholder="Observation note"
                      value={draft.note}
                      onChange={(e) =>
                        setUpdateDraft((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] || {}), note: e.target.value },
                        }))
                      }
                    />
                    <button onClick={() => submitUpdate(field.id)}>Save</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      );
    }

    if (activeView === "field-notes") {
      return (
        <section className="table-card">
          <h4>Field notes</h4>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Stage</th>
                <th>Note</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(summary.recentUpdates || []).map((item) => (
                <tr key={item.id}>
                  <td>#{item.field_id}</td>
                  <td>{item.stage}</td>
                  <td>{item.note}</td>
                  <td>{item.observed_at ? new Date(item.observed_at).toLocaleDateString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    }

    return (
      <>
        <section className="kpi-grid agent-kpis">
          <article className="kpi-card">
            <small>Assigned</small>
            <h2>{summary.totalFields}</h2>
            <p>Total fields</p>
          </article>
          <article className="kpi-card">
            <small>At risk</small>
            <h2>{statusLabel.AtRisk || 0}</h2>
            <p>Needs update</p>
          </article>
          <article className="kpi-card">
            <small>Ready</small>
            <h2>{fields.filter((f) => f.currentStage === "READY").length}</h2>
            <p>Harvest soon</p>
          </article>
        </section>

        <section className="table-card">
          <h4>Assigned fields</h4>
          <div className="agent-cards">
            {fields.map((field) => {
              const draft = updateDraft[field.id] || { stage: "GROWING", note: "" };
              return (
                <article key={field.id} className="agent-field-card">
                  <h5>{field.name}</h5>
                  <p className="muted-line">{field.cropType} • Planted {field.plantingDate?.slice(0, 10)}</p>
                  <div className="agent-tags">
                    <span className={`pill ${field.currentStage === "HARVESTED" ? "done" : "active"}`}>
                      {field.currentStage}
                    </span>
                    <span className={`pill ${field.status === "AtRisk" ? "risk" : field.status === "Completed" ? "done" : "active"}`}>
                      {field.status}
                    </span>
                  </div>
                  <p className="progress-label">Season progress</p>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressForStage(field.currentStage)}%` }} />
                  </div>
                  <div className="agent-card-footer">
                    <small>Updated {field.latestUpdateAt ? "recently" : "no updates yet"}</small>
                    <button
                      className="ghost-btn"
                      onClick={() => submitUpdate(field.id)}
                    >
                      {field.status === "Completed" ? "Closed" : "Log Update"}
                    </button>
                  </div>
                  <div className="hidden">
                    <select
                      value={draft.stage}
                      onChange={(e) =>
                        setUpdateDraft((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] || {}), stage: e.target.value },
                        }))
                      }
                    >
                      <option>PLANTED</option>
                      <option>GROWING</option>
                      <option>READY</option>
                      <option>HARVESTED</option>
                    </select>
                    <input
                      value={draft.note}
                      onChange={(e) =>
                        setUpdateDraft((prev) => ({
                          ...prev,
                          [field.id]: { ...(prev[field.id] || {}), note: e.target.value },
                        }))
                      }
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </>
    );
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="side-brand">
          <span className="side-dot">⌃</span>
          <div>
            <p>SmartSeason</p>
            <small>FIELD MONITOR</small>
          </div>
          <span className="role-badge agent-badge">◌ AGENT</span>
        </div>
        <div className="side-section">
          <p className="side-title">My work</p>
          <button
            className={activeView === "dashboard" ? "side-link active" : "side-link"}
            onClick={() => setView("dashboard")}
          >
            My Dashboard
          </button>
          <button
            className={activeView === "my-fields" ? "side-link active" : "side-link"}
            onClick={() => setView("my-fields")}
          >
            My Fields
          </button>
          <button
            className={activeView === "field-notes" ? "side-link active" : "side-link"}
            onClick={() => setView("field-notes")}
          >
            Field Notes
          </button>
        </div>
        <button
          className="side-logout"
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
        >
          Logout
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <div className="header-title-row">
              <h3>My Fields</h3>
              <span className="role-badge agent-badge">AGENT ACCOUNT</span>
            </div>
            <p>{summary.totalFields} fields assigned • Season April 2026</p>
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {renderAgentView()}

        {focusField && (
          <section className="table-card">
            <h4>Log field update - {focusField.name}</h4>
            <p className="label">Update stage to</p>
            <div className="stage-toggle">
              {["PLANTED", "GROWING", "READY", "HARVESTED"].map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={focusDraft.stage === stage ? "chip active" : "chip"}
                  onClick={() =>
                    setUpdateDraft((prev) => ({
                      ...prev,
                      [focusField.id]: { ...(prev[focusField.id] || {}), stage },
                    }))
                  }
                >
                  {stage}
                </button>
              ))}
            </div>
            <p className="label">Observations / notes</p>
            <textarea
              className="note-area"
              value={focusDraft.note}
              onChange={(e) =>
                setUpdateDraft((prev) => ({
                  ...prev,
                  [focusField.id]: { ...(prev[focusField.id] || {}), note: e.target.value },
                }))
              }
              placeholder="e.g. Crop height approx 60cm, some yellowing on east side..."
            />
            <div className="row">
              <button onClick={() => submitUpdate(focusField.id)}>Save Update</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setJwtToken] = useState("");

  useEffect(() => {
    const load = async () => {
      const authToken = localStorage.getItem("token");
      if (!authToken) return;
      setJwtToken(authToken);
      const me = await request("/me", {}, authToken);
      setUser(me);
    };
    void load();
  }, []);

  return (
    user ? <Dashboard user={user} token={token} /> : <Login onLogin={(nextUser) => { setUser(nextUser); setJwtToken(localStorage.getItem("token") || ""); }} />
  );
}

export default App;
