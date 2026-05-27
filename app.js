require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const teamRoutes = require("./routes/team.routes");
const withdrawRoutes = require("./routes/withdraw.routes");
const userRoutes = require("./routes/user.routes");
const tradeRoutes = require("./routes/trade.routes");
const authadminRoutes = require("./routes/auth.admin.routes");
const adminRoutes = require("./routes/admin.routes");
const miningRoutes = require("./routes/mining.routes");
const fundRoutes = require("./routes/fund.routes");
const rankRoutes = require("./routes/rank.routes");

const db = require("./config/db");

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://backend.jbmglobal.pro/",
     
    ],
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "ornix-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// ================= STATIC =================
app.use("/uploads", express.static("uploads"));

// ================= ROUTES =================
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/user", userRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/admin", authadminRoutes);
app.use("/api/report", adminRoutes);
app.use("/api/mining", miningRoutes);
app.use("/api/fund", fundRoutes);
app.use("/api/rank", rankRoutes);

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("API Working 🚀");
});

// ================= 404 =================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route Not Found",
  });
});

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

// ================= DB + SERVER START (FIXED) =================
async function startServer() {
  try {
    const pool = await db.poolPromise; 

    console.log("Database Connected");

    app.listen(5000, () => {
      console.log("🚀 Server running");
    });

  } catch (err) {
    console.error("DB Connection Failed:", err);
  }
}

startServer();

module.exports = app;