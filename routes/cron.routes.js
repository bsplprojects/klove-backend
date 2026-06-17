const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { levelPayout } = require("../cron/level.cron");

router.get("/level-income-cron", async (req, res) => {
  let cronRunning = false;

  try {
    if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        msg: "❌ Unauthorized! CRON SECRET NOT FOUND",
      });
    }

    if (cronRunning) {
      return res.json({
        success: true,
        msg: "⚠️ Cron already running",
      });
    }

    cronRunning = true;

    console.log("🚀 LEVEL INCOME CRON STARTED");

    const pool = await poolPromise;

    const topupRes = await pool.request().query(`
      SELECT MID, Amount
      FROM TopUp
      WHERE Amount > 0
    `);

    // ❌ weekend skip (unchanged logic)
    const dayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    });

    if (dayName === "Saturday" || dayName === "Sunday") {
      console.log(`⏭️ Skipping Level Income for ${dayName}`);
      cronRunning = false;
      return res.json({ success: true, msg: "Weekend skip" });
    }

    for (const topup of topupRes.recordset) {
      await levelPayout(topup.MID, Number(topup.Amount));
    }

    console.log("✅ LEVEL INCOME CRON COMPLETED");

    cronRunning = false;

    return res.json({
      success: true,
      msg: "Level income completed",
    });
  } catch (error) {
    cronRunning = false;

    console.error(error);
    return res.status(500).json({
      success: false,
      msg: "❌ LEVEL INCOME CRON FAILED",
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

router.post("/rank-cron", async (req, res) => {
  try {
    // if (req.headers["x-cron-key"] !== process.env.CRON_SECRET) {
    //   return res.status(401).json({
    //     success: false,
    //     msg: "❌ Unauthorized! CRON SECRET NOT FOUND",
    //   });
    // }

    const start = req.body.startDate;
    const end = req.body.endDate;

    console.log("✅ RANK CRON API TRIGGERED");

    const pool = await poolPromise;

    // fetch all the members from the member details which are active.
    const memberResult = await pool.request().query(`
      SELECT ID, ConsumerID, Name, SponsorId, mStatus FROM Member_Details WHERE LOWER(mStatus) = 'active';
    `);

    const members = memberResult.recordset;

    // Now calculate all the deposits made by each member from the topup table.
    const topupResult = await pool.request().query(`
      SELECT MID, SUM(Amount) AS totalDeposits FROM TopUp WHERE MID IN (SELECT ConsumerID FROM Member_Details WHERE LOWER(mStatus) = 'active') GROUP BY MID;
    `);

    const selfTopups = topupResult.recordset;

    // Now calculate all the deposits made by each member from the downline table.
    let downlines = [];
    const visited = new Set();

    for (const member of members) {
      let queue = [{ id: member.ConsumerID, level: 0 }];
      let srno = 0;

      while (queue.length > 0) {
        const nextQueue = [];

        for (const node of queue) {
          const { id, level } = node;

          if (visited.has(id)) continue;
          visited.add(id);

          const result = await pool.request().query(`
              SELECT
                ConsumerID,
                Name,
                JoiningDate,
                Price,
                Joining_Comp_Level,
                SponsorId,
                MobileNo,
                Address
              FROM Member_Details
              WHERE SponsorId = '${id}'
            `);

          const members = result.recordset;

          for (const member of members) {
            if (visited.has(member.ConsumerID)) continue;

            const nextLevel = level + 1;

            // ================= TOPUP + FIRST DATE =================
            const topupResult = await pool
              .request()
              .input("MID", sql.VarChar, member.ConsumerID).query(`
                  SELECT 
                    ISNULL(SUM(amount),0) AS TotalTopup,
                    MIN(tdate) AS ActiveDate
                  FROM TopUp
                  WHERE MID = @MID
                `);

            const totalTopup = topupResult.recordset[0]?.TotalTopup || 0;

            const activeDateRaw = topupResult.recordset[0]?.tdate || null;

            srno++;

            downlines.push({
              Srno: srno,
              ConsumerId: member.ConsumerID,
              ConsumerName: member.Name,
              SponsorId: member.SponsorId,
              MobileNo: member.MobileNo,
              Address: member.Address,

              Level: nextLevel,

              JoiningDate: member.JoiningDate
                ? new Date(member.JoiningDate).toLocaleString("en-IN")
                : "",

              //  NEW: FIRST TOPUP DATE
              ActiveDate: activeDateRaw
                ? new Date(activeDateRaw).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                : null,

              Amount: totalTopup,
              Status: totalTopup > 0 ? "Active" : "Inactive",
            });

            nextQueue.push({
              id: member.ConsumerID,
              level: nextLevel,
            });
          }
        }

        queue = nextQueue;
      }
    }

    // Now add the self topups amount to the downlines amount column for each member and insert the entry in the total array.
    let totals = [];

    for (const member of members) {
      const selfTopup = selfTopups.find(
        (topup) => topup.MID === member.ConsumerID,
      ) || { totalDeposits: 0 };

      const total = downlines.find(
        (downline) => downline.ConsumerId === member.ConsumerID,
      );

      if (total) {
        total.Amount += selfTopup.totalDeposits;

        totals.push({
          Srno: total.Srno,
          ConsumerId: total.ConsumerId,
          ConsumerName: total.ConsumerName,
          SponsorId: total.SponsorId,
          Level: total.Level,
          Amount: total.Amount,
          Status: total.Amount > 0 ? "Active" : "Inactive",
        });
      }
    }

    // now if the amount for a member is greater than or equal to given criteria, update his/her rank in the member details.

    let filteredMembers = [];

    totals.find((member) => {
      if (member.Amount >= 10000 && member.Amount < 100000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "STARTER",
        });
      } else if (member.Amount >= 100000 && member.Amount < 1000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "PROMOTER",
        });
      } else if (member.Amount >= 1000000 && member.Amount < 10000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "SILVER",
        });
      } else if (member.Amount >= 10000000 && member.Amount < 100000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "GOLD",
        });
      } else if (member.Amount >= 100000000 && member.Amount < 1000000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "EMERALD",
        });
      } else if (member.Amount >= 1000000000 && member.Amount < 10000000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "RUBY",
        });
      } else if (member.Amount >= 10000000000) {
        filteredMembers.push({
          ConsumerID: member.ConsumerId,
          name: member.ConsumerName,
          amount: member.Amount,
          rank: "DIAMOND",
        });
      }
    });

    // update the ranks in the member details table.
    for (const member of filteredMembers) {
      await pool
        .request()
        .input("ConsumerID", sql.VarChar, member.ConsumerID)
        .input("rank", sql.VarChar, member.rank).query(`
          UPDATE Member_Details
          SET rank = @rank
          WHERE ConsumerID = @ConsumerID
        `);
    }

    // now we will calculate the income for help fund 10 rupees will be distributed equally, first we will take out the withdrawals from the member details table between the start date and end date.

    const withdrawals = await pool
      .request()
      .input("start", sql.DateTime, start)
      .input("end", sql.DateTime, end).query(`
      SELECT wid, MID, Name, PDate, Status, (Amount - deduction) as fundAmt FROM BankTransferNew WHERE PDate >= @start AND PDate <= DATEADD(day, 1, @end) AND LOWER(Status) = 'approved';
    `);

    const totalWithdrawals = withdrawals.recordset.reduce(
      (total, withdrawal) => total + withdrawal.fundAmt,
      0,
    );

    const amountPerWithdrawal = totalWithdrawals / 10;

    // insert the data inside the Royaltyincome table (help fund)
    for (const withdrawal of withdrawals.recordset) {
      await pool
        .request()
        .input("MID", sql.VarChar, withdrawal.MID)
        .input("Name", sql.VarChar, withdrawal.Name)
        .input("pDate", sql.DateTime, withdrawal.PDate)
        .input("Amount", sql.Float, amountPerWithdrawal)
        .input(
          "Month",
          sql.VarChar,
          new Date().toLocaleString("default", { month: "long" }),
        ).query(`
          INSERT INTO RoyaltyncomeNew (MID, Name, pDate, Amount, Month)
          VALUES (@MID, @Name, @pDate, @Amount, @Month);
        `);
    }

    return res.status(200).json({
      success: true,
      msg: "✅ RANK CRON EXECUTION COMPLETED",
      data: withdrawals,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "❌ GITHUB RANK CRON EXECUTION FAILED",
    });
  }
});

module.exports = router;
