const cron = require("node-cron");
const sql = require("mssql");
const { poolPromise } = require("../config/db");

function roiIncomeCron() {
  cron.schedule(
    "1 0 * * *",
    async () => {
      try {
        console.log("✅ CRON EXECUTING...");

        // fetch all the topups from the TopUp table
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
        }
      } catch (error) {
        console.log("❌ CRON ERROR : ", error);
        throw error;
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );
}

module.exports = { roiIncomeCron };

// const sql = require("mssql");
// const { poolPromise } = require("../config/db");

// (async () => {
//   try {
//     console.log("🧪 TEST ROI RUNNING...");

//     const pool = await poolPromise;

//     const result = await pool.request().query(`
//       SELECT * FROM TopUp
//     `);

//     const topups = result.recordset;

//     const dayName = new Date().toLocaleDateString("en-US", {
//       weekday: "long",
//       timeZone: "Asia/Kolkata",
//     });

//     const now = new Date();

//     for (const topup of topups) {
//       const amount = Number(topup.amount || 0);
//       const roi = amount * 0.02;

//       const insertResult = await pool
//         .request()
//         .input("amount", sql.Float, roi)
//         .input("MID", sql.VarChar, topup.MID)
//         .input("Name", sql.VarChar, topup.Name)
//         .input("pDate", sql.DateTime, now)
//         .input("Day", sql.VarChar, dayName).query(`
//           INSERT INTO Growth_Income
//           (Amount, MID, Name, pDate, Day)
//           VALUES (@amount, @MID, @Name, @pDate, @Day)
//         `);

//       console.log(`✅ Inserted ROI ${roi} for ${topup.MID}`);
//     }

//     console.log("🎉 TEST COMPLETED");
//     process.exit(0);
//   } catch (err) {
//     console.error(err);
//     process.exit(1);
//   }
// })();
