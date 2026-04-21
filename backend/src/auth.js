const { pool } = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
     LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('ADMIN', 'AGENT') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  if (!(await columnExists("users", "password_hash"))) {
    await pool.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL");
  }
  if (await columnExists("users", "clerk_user_id")) {
    await pool.query("ALTER TABLE users MODIFY COLUMN clerk_user_id VARCHAR(255) NULL");
  }
  await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('ADMIN', 'AGENT') NOT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      crop_type VARCHAR(255) NOT NULL,
      planting_date DATE NOT NULL,
      current_stage ENUM('PLANTED', 'GROWING', 'READY', 'HARVESTED') NOT NULL,
      created_by INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_fields_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_id INT NOT NULL,
      agent_id INT NOT NULL,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_field_agent (field_id, agent_id),
      CONSTRAINT fk_assignments_field FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
      CONSTRAINT fk_assignments_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_updates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_id INT NOT NULL,
      agent_id INT NOT NULL,
      stage ENUM('PLANTED', 'GROWING', 'READY', 'HARVESTED') NOT NULL,
      note TEXT NOT NULL,
      observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_updates_field FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
      CONSTRAINT fk_updates_agent FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function seedUsers() {
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", ["admin@smartseason.co"]);
  if (rows.length) return;

  const adminHash = await bcrypt.hash("Admin1234", 10);
  const agentHash = await bcrypt.hash("demo1234", 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    [
      "Admin User",
      "admin@smartseason.co",
      adminHash,
      "ADMIN",
      "Field Agent",
      "agent@smartseason.co",
      agentHash,
      "AGENT",
    ]
  );
}

module.exports = {
  initializeSchema,
  seedUsers,
  signToken,
};
