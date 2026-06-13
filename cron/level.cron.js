const sql = require("mssql");
const { poolPromise } = require("../config/db");
const cron = require("node-cron");

// ❌❌ THIS CRON JOB IS NOT WORKING , USE THE CRON ROUTES INSTEAD
function startLevelCron() {
  // cron.schedule(
  //   "30 0 * * *",
  //   async () => {
  //     try {
  //       console.log("🚀 LEVEL INCOME CRON STARTED");
  //       const pool = await poolPromise;
  //       const topupRes = await pool.request().query(`
  //       SELECT MID, Amount
  //       FROM TopUp
  //       WHERE Amount > 0
  //       `);
  //       for (const topup of topupRes.recordset) {
  //         await levelPayout(topup.MID, Number(topup.Amount), new Date());
  //       }
  //       console.log("✅ LEVEL INCOME CRON COMPLETED");
  //     } catch (err) {
  //       console.error("❌ LEVEL CRON ERROR:", err);
  //     }
  //   },
  //   {
  //     timezone: "Asia/Kolkata",
  //   },
  // );
}

// (async () => {
//   try {
//     const pool = await poolPromise;

//     console.log("LEVEL REBUILD STARTED");

//     const topups = await pool.request().query(`
//       SELECT MID, Amount
//       FROM TopUp
//       WHERE Amount > 0
//     `);

//     const dates = [new Date("2026-06-12")];

//     for (const date of dates) {
//       for (const row of topups.recordset) {
//         await levelPayout(row.MID, Number(row.Amount), date);
//       }
//     }

//     console.log("LEVEL REBUILD COMPLETED");
//   } catch (err) {
//     console.error(err);
//   }
// })();

// ----------------------------------------------------------------------------------------------------

// ✅✅ THIS FUNCTION IS WORKING IN THE CRON ROUTES.
const levelPayout = async (MID, topupAmount, payoutDate = new Date()) => {
  const pool = await poolPromise;

  let currentMID = MID;

  const levelPercents = {
    1: 0.5,
    2: 0.2,
    3: 0.1,
    4: 0.075,
    5: 0.05,
    6: 0.05,
    7: 0.25,
  };

  for (let level = 1; level <= 7; level++) {
    // 1. GET SPONSOR
    const sponsorRes = await pool
      .request()
      .input("MID", sql.VarChar, currentMID).query(`
        SELECT SponsorId
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    const sponsorID = sponsorRes.recordset[0]?.SponsorId;

    // stop condition (end of chain or invalid)
    if (!sponsorID || sponsorID === currentMID) break;

    // IMPORTANT: move only after validation
    const nextMID = sponsorID;

    // 2. GET SPONSOR NAME (stable)
    const sponsorInfo = await pool
      .request()
      .input("MID", sql.VarChar, sponsorID).query(`
        SELECT TOP 1 Name
        FROM Member_Details
        WHERE ConsumerID = @MID
        ORDER BY ID DESC
      `);

    const sponsorName = sponsorInfo.recordset[0]?.Name;

    if (!sponsorName) {
      currentMID = nextMID;
      continue;
    }

    // 3. CHECK ACTIVE TOPUP
    const activeTopup = await pool
      .request()
      .input("MID", sql.VarChar, sponsorID).query(`
        SELECT TOP 1 Amount
        FROM TopUp
        WHERE MID = @MID
        AND Amount > 0
      `);

    if (!activeTopup.recordset.length) {
      currentMID = nextMID;
      continue;
    }

    // 4. DUPLICATE CHECK
    const duplicate = await pool
      .request()
      .input("ConsumerID", sql.VarChar, sponsorID)
      .input("FromMID", sql.VarChar, MID)
      .input("Level", sql.Int, level)
      .input("PayoutDate", sql.Date, payoutDate).query(`
        SELECT TOP 1 Id
        FROM Comission
        WHERE Consumerid = @ConsumerID
          AND lavelcosumied = @FromMID
          AND Lavel = @Level
          AND CAST(PayoutDate AS DATE) = CAST(@PayoutDate AS DATE)
          AND PayoutType = 'LEVEL'
      `);

    if (duplicate.recordset.length) {
      currentMID = nextMID;
      console.log(`❌ DUPLICATE FOUND: ${sponsorID} | SKIPPING LEVEL ${level}`);
      continue;
    }

    // 5. CALCULATION
    const percent = levelPercents[level] || 0;
    const levelIncome = Number(topupAmount) * (percent / 100);

    // 6. INSERT COMMISSION
    await pool
      .request()
      .input("Consumerid", sql.VarChar, sponsorID)
      .input("Name", sql.VarChar, sponsorName)
      .input("Level", sql.Int, level)
      .input("FromMID", sql.VarChar, MID)
      .input("Percent", sql.Decimal(18, 3), percent)
      .input("TotalBV", sql.Decimal(18, 2), topupAmount)
      .input("LevelIncome", sql.Decimal(18, 2), levelIncome)
      .input("PayoutDate", sql.DateTime, payoutDate).query(`
        INSERT INTO Comission
        (
          Payoutdate,
          Payoutstartdate,
          PayoutEnddate,
          Consumerid,
          Name,
          Lavel,
          lavelcosumied,
          Totalbv,
          [Percent],
          Levelincome,
          Totalmember,
          PayoutType
        )
        VALUES
        (
          @PayoutDate,
          @PayoutDate,
          @PayoutDate,
          @Consumerid,
          @Name,
          @Level,
          @FromMID,
          @TotalBV,
          @Percent,
          @LevelIncome,
          1,
          'LEVEL'
        )
      `);

    console.log(
      `LEVEL ${level} | ${MID} -> ${sponsorID} (${sponsorName}) | BV=${topupAmount} | Income=${levelIncome}`,
    );

    // 7. MOVE UP THE CHAIN
    currentMID = nextMID;
  }
};

module.exports = { levelPayout, startLevelCron };
