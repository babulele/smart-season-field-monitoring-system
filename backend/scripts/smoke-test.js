/* eslint-disable no-console */
require("dotenv").config({ path: ".env", override: true });

const API = process.env.API_BASE_URL || "http://localhost:4000";

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log("Running API smoke tests...");

  const adminLogin = await api("/auth/login", {
    method: "POST",
    body: { email: "admin@smartseason.co", password: "Admin1234" },
  });
  assert(adminLogin.status === 200, "Admin login failed");
  const adminToken = adminLogin.data.token;

  const agentLogin = await api("/auth/login", {
    method: "POST",
    body: { email: "agent@smartseason.co", password: "demo1234" },
  });
  assert(agentLogin.status === 200, "Agent login failed");
  const agentToken = agentLogin.data.token;

  const created = await api("/fields", {
    method: "POST",
    token: adminToken,
    body: {
      name: `Smoke Field ${Date.now()}`,
      cropType: "Maize",
      plantingDate: "2026-04-20",
      currentStage: "PLANTED",
    },
  });
  assert(created.status === 201, "Admin create field failed");
  const createdId = created.data.id;

  const agentUpdateForbidden = await api(`/fields/${createdId}/updates`, {
    method: "POST",
    token: agentToken,
    body: { stage: "GROWING", note: "attempt without assignment" },
  });
  assert(agentUpdateForbidden.status === 403, "Agent should not update unassigned field");

  const agents = await api("/agents", { token: adminToken });
  assert(agents.status === 200 && agents.data.length > 0, "Admin agents list failed");
  const agentId = agents.data[0].id;

  const assigned = await api(`/fields/${createdId}/assign`, {
    method: "POST",
    token: adminToken,
    body: { agentId },
  });
  assert(assigned.status === 201, "Admin assign field failed");

  const updateAtRisk = await api(`/fields/${createdId}/updates`, {
    method: "POST",
    token: agentToken,
    body: { stage: "GROWING", note: "pest signs detected in east corner" },
  });
  assert(updateAtRisk.status === 201, "Agent update after assignment failed");

  const adminFields1 = await api("/fields", { token: adminToken });
  const createdField1 = adminFields1.data.find((f) => f.id === createdId);
  assert(createdField1 && createdField1.status === "AtRisk", "AtRisk status logic failed");

  const updateCompleted = await api(`/fields/${createdId}/updates`, {
    method: "POST",
    token: agentToken,
    body: { stage: "HARVESTED", note: "completed harvest" },
  });
  assert(updateCompleted.status === 201, "Agent harvested update failed");

  const adminFields2 = await api("/fields", { token: adminToken });
  const createdField2 = adminFields2.data.find((f) => f.id === createdId);
  assert(createdField2 && createdField2.status === "Completed", "Completed status logic failed");

  console.log("Smoke tests passed.");
}

run().catch((error) => {
  console.error("Smoke tests failed:", error.message);
  process.exit(1);
});
