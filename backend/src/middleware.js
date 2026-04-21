const jwt = require("jsonwebtoken");
const { pool } = require("./db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.query("SELECT id, name, email, role FROM users WHERE id = ?", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    req.user = { sub: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

async function canAccessField(user, fieldId) {
  if (user.role === "ADMIN") {
    return true;
  }

  const result = await pool.query(
    "SELECT 1 FROM field_assignments WHERE field_id = ? AND agent_id = ?",
    [fieldId, user.sub]
  );
  return result[0].length > 0;
}

module.exports = {
  requireAuth,
  requireRole,
  canAccessField,
};
