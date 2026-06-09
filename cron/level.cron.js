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
        SELECT MID, Amount
        FROM TopUp
        WHERE Amount > 0
      `);

      for (const topup of topupRes.recordset) {
        await levelPayout(topup.MID, Number(topup.Amount), new Date());
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

// (async () => {
//   try {
//     const pool = await poolPromise;

//     console.log("LEVEL REBUILD STARTED");

//     const topups = await pool.request().query(`
//       SELECT MID, Amount
//       FROM TopUp
//       WHERE Amount > 0
//     `);

//     const dates = [new Date("2026-06-08"), new Date("2026-06-09")];

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

// const levelPayout = async (MID, bv, roiAmount, payoutDate) => {
//   try {
//     const pool = await poolPromise;

//     const member = await pool.request().input("MID", sql.VarChar, MID).query(`
//         SELECT ConsumerID, Name
//         FROM Member_Details
//         WHERE ConsumerID = @MID
//       `);

//     if (!member.recordset.length) return;

//     let currentMID = member.recordset[0].ConsumerID;

//     for (let level = 1; level <= 7; level++) {
//       const sponsorRes = await pool
//         .request()
//         .input("MID", sql.VarChar, currentMID).query(`
//           SELECT SponsorId
//           FROM Member_Details
//           WHERE ConsumerID = @MID
//         `);

//       if (!sponsorRes.recordset.length) break;

//       const toMID = sponsorRes.recordset[0]?.SponsorId;

//       if (!toMID) break;

//       // Move to next upline
//       currentMID = toMID;

//       // ===== GET SPONSOR NAME =====
//       const nameRes = await pool.request().input("MID", sql.VarChar, toMID)
//         .query(`
//           SELECT Name
//           FROM Member_Details
//           WHERE ConsumerID = @MID
//         `);

//       const toName = nameRes.recordset[0]?.Name || "";

//       // ===== LEVEL PERCENTAGE =====
//       let percent = 0;

//       switch (level) {
//         case 1:
//           percent = 0.005; // 0.50%
//           break;
//         case 2:
//           percent = 0.002; // 0.20%
//           break;
//         case 3:
//           percent = 0.001; // 0.10%
//           break;
//         case 4:
//           percent = 0.00075; // 0.075%
//           break;
//         case 5:
//           percent = 0.0005; // 0.050%
//           break;
//         case 6:
//           percent = 0.0005; // 0.050%
//           break;
//         case 7:
//           percent = 0.0025; // 0.25%
//           break;
//       }

//       const levelIncome = roiAmount * percent;

//       // ===== ACTIVE MEMBER CHECK =====
//       const topup = await pool.request().input("MID", sql.VarChar, toMID)
//         .query(`
//           SELECT TOP 1 MID
//           FROM TopUp
//           WHERE MID = @MID
//             AND Amount > 0
//         `);

//       // Sponsor inactive -> skip income
//       if (!topup.recordset.length) continue;

//       const alreadyPaid = await pool
//         .request()
//         .input("Consumerid", sql.VarChar, toMID)
//         .input("FromMID", sql.VarChar, MID)
//         .input("Level", sql.Int, level).query(`
//                 SELECT TOP 1 Id
//                 FROM Comission
//                 WHERE Consumerid = @Consumerid
//                 AND lavelcosumied = @FromMID
//                 AND Lavel = @Level
//                 AND CAST(Payoutdate AS DATE) = CAST(GETDATE() AS DATE)
//                 AND PayoutType = 'LEVEL'
//         `);

//       if (alreadyPaid.recordset.length) {
//         continue;
//       }

//       // ===== INSERT COMMISSION =====
//       await pool
//         .request()
//         .input("Consumerid", sql.VarChar, toMID)
//         .input("Name", sql.VarChar, toName)
//         .input("Level", sql.Int, level)
//         .input("FromMID", sql.VarChar, MID)
//         .input("percent", sql.Decimal(18, 5), percent)
//         .input("TotalBV", sql.Decimal(18, 2), bv)
//         .input("PayoutDate", sql.DateTime, payoutDate)
//         .input("Levelincome", sql.Decimal(18, 2), levelIncome)
//         .input("Totalmember", sql.Int, 1).query(`
//             INSERT INTO Comission
//             (
//               Payoutdate,
//               Payoutstartdate,
//               PayoutEnddate,
//               Consumerid,
//               Name,
//               Lavel,
//               [Percent],
//               lavelcosumied,
//               Totalbv,
//               Levelincome,
//               Totalmember,
//               PayoutType
//             )
//             VALUES
//             (
//              @PayoutDate,
//             @PayoutDate,
//             @PayoutDate,
//               @Consumerid,
//               @Name,
//               @Level,
//               @percent,
//               @FromMID,
//               @TotalBV,
//               @Levelincome,
//               @Totalmember,
//               'LEVEL'
//             )
//           `);

//       console.log(
//         `Level ${level} Income Added | To: ${toMID} | Amount: ${levelIncome}`,
//       );
//     }
//   } catch (err) {
//     console.error("Level payout error:", err);
//     throw err;
//   }
// };

module.exports = { levelPayout };
