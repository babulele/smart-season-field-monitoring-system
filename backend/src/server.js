require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("./db");
const { computeFieldStatus } = require("./status");
const { initializeSchema, seedUsers, signToken } = require("./auth");
const { requireAuth, requireRole, canAccessField } = require("./middleware");

const app = express();
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed =
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin) ||
      /^http:\/\/\[::1\]:\d+$/i.test(origin);
    if (!allowed) return callback(null, false);
    return callback(null, origin);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

const stageEnum = z.enum(["PLANTED", "GROWING", "READY", "HARVESTED"]);

async function fetchFieldsForUser(user) {
  const params = [];
  let whereClause = "";
  if (user.role === "AGENT") {
    params.push(user.sub);
    whereClause = `WHERE EXISTS (
      SELECT 1 FROM field_assignments fa
      WHERE fa.field_id = f.id AND fa.agent_id = ?
    )`;
  }

  const [rows] = await pool.query(
    `
      SELECT
        f.id, f.name, f.crop_type, f.planting_date, f.current_stage,
        f.created_at, f.updated_at,
        (
          SELECT fu.note
          FROM field_updates fu
          WHERE fu.field_id = f.id
          ORDER BY fu.observed_at DESC
          LIMIT 1
        ) AS latest_note,
        (
          SELECT fu.observed_at
          FROM field_updates fu
          WHERE fu.field_id = f.id
          ORDER BY fu.observed_at DESC
          LIMIT 1
        ) AS latest_update_at
      FROM fields f
      ${whereClause}
      ORDER BY f.id DESC
    `,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cropType: row.crop_type,
    plantingDate: row.planting_date,
    currentStage: row.current_stage,
    status: computeFieldStatus(row),
    latestNote: row.latest_note,
    latestUpdateAt: row.latest_update_at,
  }));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [users] = await pool.query("SELECT id, name, email, role, password_hash FROM users WHERE email = ?", [
    parsed.data.email,
  ]);
  const user = users[0];
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(parsed.data.password, user.password_hash || "");
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  return res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/me", requireAuth, async (req, res) => {
  const userResult = await pool.query("SELECT id, name, email, role FROM users WHERE id = ?", [
    req.user.sub,
  ]);
  if (!userResult[0][0]) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(userResult[0][0]);
});

app.get("/fields", requireAuth, async (req, res) => {
  const fields = await fetchFieldsForUser(req.user);
  return res.json(fields);
});

app.post("/fields", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    cropType: z.string().min(1),
    plantingDate: z.string().min(1),
    currentStage: stageEnum.default("PLANTED"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const [insertResult] = await pool.query(
    `INSERT INTO fields (name, crop_type, planting_date, current_stage, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [parsed.data.name, parsed.data.cropType, parsed.data.plantingDate, parsed.data.currentStage, req.user.sub]
  );
  const [createdRows] = await pool.query(
    "SELECT id, name, crop_type, planting_date, current_stage FROM fields WHERE id = ?",
    [insertResult.insertId]
  );
  return res.status(201).json(createdRows[0]);
});

app.patch("/fields/:id", requireAuth, async (req, res) => {
  const fieldId = Number(req.params.id);
  if (!fieldId) {
    return res.status(400).json({ error: "Invalid field id" });
  }

  const canAccess = await canAccessField(req.user, fieldId);
  if (!canAccess) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const schema = z.object({
    name: z.string().optional(),
    cropType: z.string().optional(),
    plantingDate: z.string().optional(),
    currentStage: stageEnum.optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  if (req.user.role !== "ADMIN") {
    const agentAllowed = z.object({ currentStage: stageEnum });
    const result = agentAllowed.safeParse(parsed.data);
    if (!result.success) {
      return res.status(403).json({ error: "Agents can only update stage" });
    }
  }

  const updates = [];
  const values = [];
  if (parsed.data.name !== undefined) {
    updates.push("name = ?");
    values.push(parsed.data.name);
  }
  if (parsed.data.cropType !== undefined) {
    updates.push("crop_type = ?");
    values.push(parsed.data.cropType);
  }
  if (parsed.data.plantingDate !== undefined) {
    updates.push("planting_date = ?");
    values.push(parsed.data.plantingDate);
  }
  if (parsed.data.currentStage !== undefined) {
    updates.push("current_stage = ?");
    values.push(parsed.data.currentStage);
  }
  if (!updates.length) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(fieldId);

  const [updateResult] = await pool.query(`UPDATE fields SET ${updates.join(", ")} WHERE id = ?`, values);
  if (!updateResult.affectedRows) {
    return res.status(404).json({ error: "Field not found" });
  }
  const [updatedRows] = await pool.query(
    "SELECT id, name, crop_type, planting_date, current_stage FROM fields WHERE id = ?",
    [fieldId]
  );
  return res.json(updatedRows[0]);
});

app.post("/fields/:id/assign", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const fieldId = Number(req.params.id);
  const schema = z.object({ agentId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!fieldId || !parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  await pool.query(
    `INSERT INTO field_assignments (field_id, agent_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [fieldId, parsed.data.agentId]
  );
  return res.status(201).json({ ok: true });
});

app.post("/fields/:id/updates", requireAuth, requireRole("AGENT"), async (req, res) => {
  const fieldId = Number(req.params.id);
  if (!fieldId) {
    return res.status(400).json({ error: "Invalid field id" });
  }
  const canAccess = await canAccessField(req.user, fieldId);
  if (!canAccess) {
    return res.status(403).json({ error: "You are not assigned to this field" });
  }

  const schema = z.object({
    stage: stageEnum,
    note: z.string().min(1),
    observedAt: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  await pool.query(
    `INSERT INTO field_updates (field_id, agent_id, stage, note, observed_at)
     VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [fieldId, req.user.sub, parsed.data.stage, parsed.data.note, parsed.data.observedAt || null]
  );

  await pool.query("UPDATE fields SET current_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
    parsed.data.stage,
    fieldId,
  ]);

  return res.status(201).json({ ok: true });
});

app.get("/fields/:id/updates", requireAuth, async (req, res) => {
  const fieldId = Number(req.params.id);
  if (!fieldId) {
    return res.status(400).json({ error: "Invalid field id" });
  }
  const canAccess = await canAccessField(req.user, fieldId);
  if (!canAccess) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const updates = await pool.query(
    `SELECT fu.id, fu.stage, fu.note, fu.observed_at, u.name AS agent_name
     FROM field_updates fu
     JOIN users u ON u.id = fu.agent_id
     WHERE fu.field_id = ?
     ORDER BY fu.observed_at DESC`,
    [fieldId]
  );
  return res.json(updates[0]);
});

app.get("/dashboard/summary", requireAuth, async (req, res) => {
  const fields = await fetchFieldsForUser(req.user);
  const statusBreakdown = fields.reduce(
    (acc, field) => {
      acc[field.status] += 1;
      return acc;
    },
    { Active: 0, AtRisk: 0, Completed: 0 }
  );

  const [recentUpdates] = await pool.query(
    `SELECT fu.id, fu.field_id, fu.stage, fu.note, fu.observed_at, u.name AS agent_name
     FROM field_updates fu
     JOIN users u ON u.id = fu.agent_id
     ${
       req.user.role === "AGENT"
         ? "WHERE fu.field_id IN (SELECT field_id FROM field_assignments WHERE agent_id = ?)"
         : ""
     }
     ORDER BY fu.observed_at DESC
     LIMIT 5`,
    req.user.role === "AGENT" ? [req.user.sub] : []
  );

  return res.json({
    totalFields: fields.length,
    statusBreakdown,
    recentUpdates,
  });
});

app.get("/agents", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const [agents] = await pool.query(
    "SELECT id, name, email FROM users WHERE role = 'AGENT' ORDER BY name ASC"
  );
  return res.json(agents);
});

async function start() {
  await initializeSchema();
  await seedUsers();

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
