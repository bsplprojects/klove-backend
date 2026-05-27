const { poolPromise, sql } = require("../config/db");

exports.getProfile = async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        message: "userId required",
      });
    }

    const pool = await poolPromise;

    // 1️⃣ TABLE DATA
    const result = await pool
      .request()
      .input("UserId", sql.VarChar, userId)
      .query(`
        SELECT *
        FROM member_details
        WHERE ConsumerID = @UserId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = result.recordset[0];

    // 2️⃣ STORED PROCEDURE DATA
    const spResult = await pool
      .request()
      .input("UserId", sql.VarChar, userId)
      .execute("Get_MemberDashboard");   

    const spData = spResult.recordset;

     const fwResult = await pool
      .request()
      .input("UserId", sql.VarChar, userId)
      .execute("Get_MyFundWallet");   

    const fwData = fwResult.recordset;

    // 3️⃣ COMBINED RESPONSE
    res.json({
      ...user,
      extra: spData,
      extra2: fwData  
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};


exports.todayYesterdayReport = async (req, res) => {
  try {
    const MID = req.query.MID;
  
    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT 
            *,
            CASE 
                WHEN CAST(EntryDate AS DATE) = CAST(GETDATE() AS DATE)
                THEN 'Today'
                ELSE 'Yesterday'
            END AS DayType
        FROM
        (
            -- ================= COMMISSION =================
            SELECT 
                'Commission' AS ReportType,
                Consumerid AS MID,
                Name,
                Payoutdate AS EntryDate,
                Levelincome AS Amount,
                PayoutType AS IncomeType,
                NULL AS ExtraInfo
            FROM Comission
            WHERE Consumerid = @MID
            AND CAST(Payoutdate AS DATE) IN (
                CAST(GETDATE() AS DATE),
                CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
            )

            UNION ALL

            -- ================= REWARD =================
            SELECT
                'Reward' AS ReportType,
                MID,
                Name,
                issueDAte AS EntryDate,
                Reward AS Amount,
                rewardName AS IncomeType,
                remarks AS ExtraInfo
            FROM reward_nxtStep
            WHERE MID = @MID
            AND CAST(issueDAte AS DATE) IN (
                CAST(GETDATE() AS DATE),
                CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
            )

            UNION ALL

            -- ================= GROWTH INCOME =================
            SELECT
                'Growth Income' AS ReportType,
                MID,
                Name,
                pDate AS EntryDate,
                Amount AS Amount,
                Status AS IncomeType,
                HashID AS ExtraInfo
            FROM Growth_Income
            WHERE MID = @MID
            AND CAST(pDate AS DATE) IN (
                CAST(GETDATE() AS DATE),
                CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)
            )

        ) X

        ORDER BY EntryDate DESC
      `);

    const rows = result.recordset;

    // ================= SUMMARY =================

    const todayTotal = rows
      .filter((x) => x.DayType === "Today")
      .reduce((sum, x) => sum + Number(x.Amount || 0), 0);

    const yesterdayTotal = rows
      .filter((x) => x.DayType === "Yesterday")
      .reduce((sum, x) => sum + Number(x.Amount || 0), 0);

    return res.json({
      success: true,

      summary: {
        MID,
        todayTotal,
        yesterdayTotal,
        totalRecords: rows.length,
      },

      data: rows,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCommissionHistory = async (req, res) => {
  try {
    const MID = req.query.MID;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT TOP (100000)
              [Id],
              [Payoutdate],
              [Payoutstartdate],
              [PayoutEnddate],
              [Consumerid],
              [Name],
              [Lavel],
              [lavelcosumied],
              [Totalbv],
              [Percent],
              [Levelincome],
              [Totalmember],
              [PayoutType]
        FROM [mlm_orenix].[dbo].[Comission]
        WHERE Consumerid = @MID
        ORDER BY Payoutdate DESC
      `);

    const rows = result.recordset;

    // ================= TOTAL =================

    const totalIncome = rows.reduce(
      (sum, item) => sum + Number(item.Levelincome || 0),
      0
    );

    return res.json({
      success: true,

      summary: {
        MID,
        totalRecords: rows.length,
        totalIncome,
      },

      data: rows,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};