const sql = require("mssql");
const { poolPromise } = require("../config/db");
const cron = require("node-cron");

cron.schedule(
  "0 0 * * *",
  async () => {
    try {
      console.log("🚀 LEVEL INCOME CRON STARTED");

      const pool = await poolPromise;

      const topupRes = await pool.request().query(`
        SELECT MID, amount
        FROM TopUp
        WHERE amount > 0
      `);

      const topups = topupRes.recordset;

      for (const topup of topups) {
        const roiAmount = Number(topup.amount) * 0.02;

        await levelPayout(topup.MID, roiAmount);
      }

      console.log("✅ LEVEL INCOME CRON COMPLETED");
    } catch (err) {
      console.error("❌ LEVEL CRON ERROR:", err);
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);

const levelPayout = async (MID, amt) => {
  try {
    const pool = await poolPromise;

    const member = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT ConsumerID, Name
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (!member.recordset.length) return;

    let currentMID = member.recordset[0].ConsumerID;

    for (let level = 1; level <= 7; level++) {
      const sponsorRes = await pool
        .request()
        .input("MID", sql.VarChar, currentMID).query(`
          SELECT SponsorId
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      if (!sponsorRes.recordset.length) break;

      const toMID = sponsorRes.recordset[0]?.SponsorId;

      if (!toMID) break;

      // Move to next upline
      currentMID = toMID;

      // ===== GET SPONSOR NAME =====
      const nameRes = await pool.request().input("MID", sql.VarChar, toMID)
        .query(`
          SELECT Name
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      const toName = nameRes.recordset[0]?.Name || "";

      // ===== LEVEL PERCENTAGE =====
      let percent = 0;

      switch (level) {
        case 1:
          percent = 0.005; // 0.50%
          break;
        case 2:
          percent = 0.002; // 0.20%
          break;
        case 3:
          percent = 0.001; // 0.10%
          break;
        case 4:
          percent = 0.00075; // 0.075%
          break;
        case 5:
          percent = 0.0005; // 0.050%
          break;
        case 6:
          percent = 0.0005; // 0.050%
          break;
        case 7:
          percent = 0.0025; // 0.25%
          break;
      }

      const levelIncome = Number(amt) * percent;

      // ===== ACTIVE MEMBER CHECK =====
      const topup = await pool.request().input("MID", sql.VarChar, toMID)
        .query(`
          SELECT TOP 1 MID
          FROM TopUp
          WHERE MID = @MID
            AND Amount > 0
        `);

      // Sponsor inactive -> skip income
      if (!topup.recordset.length) continue;

      const alreadyPaid = await pool
        .request()
        .input("Consumerid", sql.VarChar, toMID)
        .input("FromMID", sql.VarChar, MID)
        .input("Level", sql.Int, level).query(`
                    SELECT TOP 1 Id
                    FROM Comission
                    WHERE Consumerid = @Consumerid
                    AND lavelcosumied = @FromMID
                    AND Lavel = @Level
                    AND CAST(Payoutdate AS DATE) = CAST(GETDATE() AS DATE)
                    AND PayoutType = 'LEVEL'
             `);

      if (alreadyPaid.recordset.length) {
        continue;
      }
      // ===== INSERT COMMISSION =====
      await pool
        .request()
        .input("Consumerid", sql.VarChar, toMID)
        .input("Name", sql.VarChar, toName)
        .input("Level", sql.Int, level)
        .input("FromMID", sql.VarChar, MID)
        .input("percent", sql.VarChar, percent)
        .input("TotalBV", sql.Decimal(18, 2), Number(amt))
        .input("Levelincome", sql.Decimal(18, 2), levelIncome)
        .input("Totalmember", sql.Int, 1).query(`
            INSERT INTO Comission
            (
              Payoutdate,
              Payoutstartdate,
              PayoutEnddate,
              Consumerid,
              Name,
              Lavel,
              Percent,
              lavelcosumied,
              Totalbv,
              Levelincome,
              Totalmember,
              PayoutType
            )
            VALUES
            (
              GETDATE(),
              GETDATE(),
              GETDATE(),
              @Consumerid,
              @Name,
              @Level,
              @percent,
              @FromMID,
              @TotalBV,
              @Levelincome,
              @Totalmember,
              'LEVEL'
            )
          `);

      console.log(
        `Level ${level} Income Added | To: ${toMID} | Amount: ${levelIncome}`,
      );
    }
  } catch (err) {
    console.error("Level payout error:", err);
    throw err;
  }
};

module.exports = { levelPayout };
