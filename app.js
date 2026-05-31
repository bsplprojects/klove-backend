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
const packageRoutes = require("./routes/package.routes");

const db = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// ================= MIDDLEWARE =================

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://backend.jbmglobal.pro",
      "https://jbmglobal.pro",
      "https://www.jbmglobal.pro",
    ],
    credentials: true,
  })
);

// ================= SESSION =================

app.use(
  session({
    secret: process.env.SESSION_SECRET || "ornix-secret",
    resave: false,
    saveUninitialized: false,

    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 day
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
app.use("/api/package", packageRoutes);

// ================= HEALTH CHECK =================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API Working 🚀",
    environment: process.env.NODE_ENV || "development",
  });
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
  console.error("SERVER ERROR =>", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ================= START SERVER =================

async function startServer() {
  try {
    await db.poolPromise;

    console.log("✅ Database Connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server Running On Port ${PORT}`);
      console.log(
        `🌍 Environment: ${process.env.NODE_ENV || "development"}`
      );
    });
  } catch (err) {
    console.error("❌ Database Connection Failed");
    console.error(err);
    process.exit(1);
  }
}

startServer();

module.exports = app;