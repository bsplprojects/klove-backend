const sql = require("mssql");

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: parseInt(process.env.DB_PORT),

  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

// single connection pool
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log("✅ MSSQL Connected");
    return pool;
  })
  .catch((err) => {
    console.log("❌ DB Connection Failed", err);
  });

module.exports = {
  sql,
  poolPromise,
};