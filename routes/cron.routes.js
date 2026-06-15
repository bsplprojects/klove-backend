const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { levelPayout } = require("../cron/level.cron");

router.get("/level-income-cron", async (req, res) => {
  try {
    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        msg: "❌ Unauthorized! CRON SECRET NOT FOUND",
      });
    }

    console.log("🚀 LEVEL INCOME CRON STARTED");
    const pool = await poolPromise;

    const topupRes = await pool.request().query(`
        SELECT MID, Amount
        FROM TopUp
        WHERE Amount > 0
    `);

    const dayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    });

    const now = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      }),
    );

    if (dayName === "Saturday" || dayName === "Sunday") {
      console.log(`⏭️ Skipping Level Income for ${dayName}`);
      return;
    }

    for (const topup of topupRes.recordset) {
      await levelPayout(topup.MID, Number(topup.Amount), new Date());
    }

    console.log("✅ LEVEL INCOME CRON COMPLETED");
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "❌ GITHUB LEVEL INCOME CRON EXECUTION FAILED",
    });
  }
});

router.post("/roi-income-cron", async (req, res) => {
  try {
    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        msg: "❌ Unauthorized! CRON SECRET NOT FOUND",
      });
    }

    console.log("✅ ROI CRON API TRIGGERED");

    const pool = await poolPromise;
    const result = await pool.request().query(`
            SELECT * FROM TopUp
        `);

    const topups = result.recordset;

    const dayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    });

    const now = new Date(
      new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
      }),
    );

    if (dayName === "Saturday" || dayName === "Sunday") {
      console.log(`⏭️ Skipping Growth Income for ${dayName}`);
      return;
    }

    // for every topup deduct 2% from the amount
    for (let i = 0; i < topups.length; i++) {
      const topup = topups[i];
      const amount = topup.amount ? Number(topup.amount) : 0;
      const roi = amount * 0.02;
      const newAmount = amount - roi;

      await pool
        .request()
        .input("amount", sql.Float, roi)
        .input("MID", sql.VarChar, topup.MID)
        .input("Name", sql.VarChar, topup.Name)
        .input("pDate", sql.DateTime, now)
        .input("Day", sql.VarChar, dayName).query(`
              INSERT INTO Growth_Income (Amount, MID, Name, pDate, Day)
              VALUES (@amount, @MID, @Name, @pDate, @Day);
            `);

      console.log(`✅ GROWTH INCOME ADDED FOR ${topup.MID}`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "❌ GITHUB ROI CRON EXECUTION FAILED",
    });
  }
});

module.exports = router;
