import sql from "mssql";
import { poolPromise } from "../config/db.js";
import levelPayout from "../services/levelPayout.js";

// ================= SHOW DIRECT TEAM =================
export const showDirectTeam = async (req, res) => {
  try {
    const { userName } = req.params;

    // CHECK USERNAME
    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    const pool = await poolPromise;

    // ================= GET DIRECT MEMBERS =================
    const memberResult = await pool
      .request()
      .input("ReferralId", sql.VarChar, userName)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE SponsorId = @ReferralId
        ORDER BY JoiningDate DESC
      `);

    const members = memberResult.recordset;

    let finalData = [];

    // ================= MEMBER LOOP =================
    for (const member of members) {
      // TOTAL TOPUP OF MEMBER
      const topupResult = await pool
        .request()
        .input("MID", sql.VarChar, member.ConsumerID)
        .query(`
          SELECT
            ISNULL(SUM(amount), 0) AS TotalTopup,
            MAX(pDate) AS LastTopupDate
          FROM TopUp
          WHERE MID = @MID
        `);

      const topup = topupResult.recordset[0];

      // PUSH SINGLE RECORD
      finalData.push({
        ConsumerID: member.ConsumerID,
        Name: member.Name,
        MobileNo: member.MobileNo,
        JoiningDate: member.JoiningDate,
Address: member.Address,
        TotalTopup: topup.TotalTopup || 0,
        LastTopupDate: topup.LastTopupDate || null,

        Status: topup.TotalTopup > 0 ? "Active" : "Inactive",
      });
    }

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      totalMembers: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("ShowDirectTeam Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ================= MEMBER DOWNLINE DETAILS WITH LEVEL =================
export const memberDownlineDetailsWithLevel = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const pool = await poolPromise;

    let finalData = [];
    const visited = new Set();

    let queue = [{ id: userId, level: 0 }];
    let srno = 0;

    while (queue.length > 0) {
      const nextQueue = [];

      for (const node of queue) {
        const { id, level } = node;

        if (visited.has(id)) continue;
        visited.add(id);

        // ================= DOWNLINE =================
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
            .input("MID", sql.VarChar, member.ConsumerID)
            .query(`
              SELECT 
                ISNULL(SUM(amount),0) AS TotalTopup,
                MIN(tdate) AS ActiveDate
              FROM TopUp
              WHERE MID = @MID
            `);

          const totalTopup =
            topupResult.recordset[0]?.TotalTopup || 0;

          const activeDateRaw =
            topupResult.recordset[0]?.tdate || null;

          srno++;

          finalData.push({
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

            // 🔥 NEW: FIRST TOPUP DATE
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

    return res.status(200).json({
      success: true,
      total: finalData.length,
      data: finalData,
    });

  } catch (error) {
    console.log("DOWNLINE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


export const updateMyRank = async (req, res) => {
  try {

    const pool = await poolPromise;

    const { memberId } = req.body;

    // direct active with topup >= 50
    const directRes = await pool.request()
      .input("mid", memberId)
      .query(`
        SELECT COUNT(*) AS total
        FROM Member_Details
        WHERE SponsorId = @mid
        AND mStatus = 'Active'
        AND Price >= 50
      `);

    const totalDirect = directRes.recordset[0].total;

    // existing ranks from reward_nxtStep
    const rankRes = await pool.request()
      .input("mid", memberId)
      .query(`
        SELECT remarks
        FROM reward_nxtStep
        WHERE MID = @mid
      `);

    const ranks = rankRes.recordset.map(r => r.remarks);

    let rank = "";
    let percentage = 0;

    // rank check from remarks
    if (ranks.includes("OX2")) {

      rank = "OX2";
      percentage = 1;

    }
    else if (ranks.includes("OX1")) {

      rank = "OX1";
      percentage = 2;

    }
    else if (totalDirect >= 8) {

      rank = "DIRECT";
      percentage = 3;

    }

    // update rank + percentage
if (rank !== "") {

  await pool.request()
    .input("mid", memberId)
    .input("rank", rank)
    .input("percentage", percentage)
    .query(`
      UPDATE Member_Details
      SET 
        Cr_Level = @rank,
        Joining_Comp_Level = @percentage
      WHERE MID = @mid
    `);

}

    res.send({
      success: true,
      rank,
      percentage,
      totalDirect
    });

  } catch (err) {

    console.log(err);

    res.send({
      success: false
    });

  }
};


// ===============================
// ACTIVATE PLAN API
// ===============================

export const activatePlan = async (req, res) => {
  try {
    const { userId, amount, round } = req.body;

    // ================= VALIDATION =================

    if (!userId || !amount || !round) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const investAmount = Number(amount);

    if (isNaN(investAmount) || investAmount < 30 || investAmount > 50000) {
      return res.status(400).json({
        success: false,
        message: "Investment amount must be between 30 and 50000",
      });
    }

    const pool = await poolPromise;

    // ================= USER DETAILS =================

    const userResult = await pool
      .request()
      .input("ConsumerID", sql.VarChar, userId)
      .query(`
        SELECT TOP 1 *
        FROM Member_Details
        WHERE ConsumerID = @ConsumerID
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.recordset[0];

    // ================= WALLET BALANCE =================

    const walletResult = await pool
      .request()
      .input("userID", sql.VarChar, userId)
      .execute("Get_MyFundWallet");

    const walletBalance = Number(
      walletResult.recordset?.[0]?.Balance || 0
    );

    if (walletBalance < investAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    // ================= TOPUP INSERT =================

    await pool
      .request()
      .input("MID", sql.VarChar, userId)
      .input("Name", sql.VarChar, user.Name || "")
      .input("amount", sql.Decimal(18, 2), investAmount)
      .input("pType", sql.VarChar, `Round ${round}`)
      .input("Coin", sql.Float, investAmount)
      .query(`
        INSERT INTO TopUp
        (
          MID,
          Name,
          amount,
          tdate,
          pDate,
          pType,
          Coin,
          Status,
          UserAddress,
          TxHash
        )
        VALUES
        (
          @MID,
          @Name,
          @amount,
          GETDATE(),
          GETDATE(),
          @pType,
          @Coin,
          'Active',
          '',
          ''
        )
      `);

      // ================= LEDGER DEBIT =================

await pool
  .request()
  .input("MID", sql.VarChar, userId)
  .input("Name", sql.VarChar, user.Name || "")
  .input("Amount", sql.Decimal(18, 2), investAmount)
  .input("Round", sql.VarChar, `Round ${round}`)
  .query(`
    INSERT INTO ledger
    (
      MID,
      Name,
      pDate,
      qty,
      Amount,
      type,
      Remarks,
      tType,
      transID
    )
    VALUES
    (
      @MID,
      @Name,
      GETDATE(),
      1,
      @Amount,
      'Plan Activation',
      CONCAT('Activated ', @Round),
      'Dr.',
      CONCAT('TOPUP-', FORMAT(GETDATE(),'yyyyMMddHHmmss'))
    )
  `);


    // ================= MEMBER UPDATE =================

    await pool
      .request()
      .input("ConsumerID", sql.VarChar, userId)
      .input("Price", sql.Decimal(18, 2), investAmount)
      .input("Product_Name", sql.VarChar, `Round ${round}`)
      .input("Joining_Comp_Level", sql.Int, round)
      .query(`
        UPDATE Member_Details
        SET
          mStatus = 'Active',
          Price += @Price,
          Product_Name = @Product_Name,
          Joining_Comp_Level = @Joining_Comp_Level
        WHERE ConsumerID = @ConsumerID
      `);

  

    await levelPayout(userId, investAmount);

    // ================= SUCCESS =================

    return res.status(200).json({
      success: true,
      message: "Plan Activated Successfully",
      data: {
        userId,
        amount: investAmount,
        round,
        walletBalance,
      },
    });
  } catch (error) {
    console.error("ActivatePlan Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ===============================
// GET ALL ACTIVATED ROUNDS
// ===============================

export const checkRoundActive = async (
  req,
  res
) => {
  try {
    const { memberId } = req.params;

    const pool = await poolPromise;

    // ================= GET ROUNDS =================
    const result = await pool
      .request()
      .input("MID", sql.VarChar, memberId)
      .query(`
        SELECT pType
        FROM TopUp
        WHERE MID = @MID
      `);

    // ================= ROUND ARRAY =================
    const activatedRounds = result.recordset
      .map((item) => {
        const round = String(item.pType)
          .replace("Round ", "")
          .trim();

        return Number(round);
      })
      .filter((x) => !isNaN(x));

    return res.status(200).json({
      success: true,
      data: activatedRounds,
    });
  } catch (error) {
    console.log("Check Round Error:", error);

    return res.status(500).json({
      success: false,
      data: [],
      message: "Server Error",
    });
  }
};

// ===============================
// GET ALL ACTIVATED ROUNDS
// ===============================

export const getTopupHistory = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT *
      FROM TopUp
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ===============================
// GET ALL ACTIVATED ROUNDS
// ===============================
export const getMyPlans = async (req, res) => {
  try {
    const { memberId } = req.params;

    const pool = await poolPromise;

    // User Plans
    const plansResult = await pool
      .request()
      .input("MID", sql.VarChar, memberId)
      .query(`
        SELECT *
        FROM TopUp
        WHERE MID = @MID
        ORDER BY Id DESC
      `);

    // All Packages
    const packageResult = await pool.request().query(`
      SELECT
        Id,
        ProductCategory,
        ProductSubCategory,
        Description,
        Price,
        Image,
        PV
      FROM ProductSubcategory
    `);

    const packages = packageResult.recordset;

    const data = plansResult.recordset.map((plan) => {
      // Round 1 => 1
      const roundNo = String(plan.pType || "")
        .replace("Round", "")
        .trim();

      const pkg = packages.find(
        (x) => String(x.ProductSubCategory).trim() === roundNo
      );

      return {
        ...plan,

        PackageId: pkg?.Id || null,
        ProductCategory: pkg?.ProductCategory || null,
        ProductSubCategory: pkg?.ProductSubCategory || null,
        Description: pkg?.Description || null,
        Price: pkg?.Price || null,
        Image: pkg?.Image || null,
        PV: pkg?.PV || null,
      };
    });

    console.log(data);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



// let isRunning = false;

// export const activatePlanController = async (req, res) => {
//   if (isRunning) {
//     return res.status(429).json({
//       success: false,
//       message: "Already processing request",
//     });
//   }

//   isRunning = true;

//   try {
//     const pool = await poolPromise;
//     const transaction = new sql.Transaction(pool);

//     await transaction.begin();

//     const request = new sql.Request(transaction);

//     const result = await request.query(`
//       SELECT MID, amount
//       FROM TopUp
//     `);

//     const topups = result.recordset;

//     console.log("TOPUPS:", topups); // 🔥 will print only once now

//     if (!topups.length) {
//       throw new Error("No TopUp records found");
//     }

//     for (const row of topups) {
//       await levelPayout(row.MID, row.amount, transaction);
//     }

//     await transaction.commit();

//     return res.json({
//       success: true,
//       message: "All TopUp rows processed successfully",
//     });

//   } catch (err) {
//     console.log("Activate Error:", err);

//     try {
//       await transaction.rollback();
//     } catch (e) {
//       console.log("Rollback Error:", e.message);
//     }

//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });

//   } finally {
//     isRunning = false; // 🔥 reset lock
//   }
// };