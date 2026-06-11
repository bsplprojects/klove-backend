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

    for (const topup of topupRes.recordset) {
      await levelPayout(topup.MID, Number(topup.Amount), new Date());
    }

    console.log("✅ LEVEL INCOME CRON COMPLETED");
  } catch (error) {
    console.error(err);
    res.status(500).json({
      success: false,
      msg: "❌ GITHUB LEVEL INCOME CRON EXECUTION FAILED",
    });
  }
});

module.exports = router;
