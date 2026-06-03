const { poolPromise, sql } = require("../config/db");
const bcrypt = require("bcrypt");

exports.getProfile = async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        message: "userId required",
      });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("UserId", sql.VarChar, userId)
      .query(`
        SELECT Name, ConsumerID, JoiningDate, MobileNo, PhoneNo,SponsorId, SponsorName, Country, City, Address, State, PinCode,Sex
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
      extra2: fwData,
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

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
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

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT TOP (100000)
          c.[Id],
          c.[Payoutdate],
          c.[Payoutstartdate],
          c.[PayoutEnddate],
          c.[Consumerid],

          c.[Name] AS ConsumerName,

          c.[Lavel],

          m.[Name] AS MemberName,   

          c.[lavelcosumied],
          c.[Totalbv],
          c.[Percent],
          c.[Levelincome],
          c.[Totalmember],
          c.[PayoutType]

        FROM [Comission] c
        LEFT JOIN [member_details] m
          ON c.[lavelcosumied] = m.[Consumerid]

        WHERE c.[Consumerid] = @MID
        ORDER BY c.[Payoutdate] DESC
      `);

    const rows = result.recordset;

    // ================= TOTAL INCOME =================
    const totalIncome = rows.reduce(
      (sum, item) => sum + Number(item.Levelincome || 0),
      0,
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
    console.log("Commission Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================= UPDATE PROFILE =================

exports.updateProfile = async (req, res) => {
  try {
    const {
      MID,
      name,
      gender,
      country,
      address,
      state,
      pincode,
      city,
      email,
      phone,
    } = req.body;

    // ================= VALIDATION =================

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    // ================= DB CONNECTION =================

    const pool = await poolPromise;

    // ================= CHECK USER =================

    const checkUser = await pool.request().input("MID", sql.VarChar, MID)
      .query(`
        SELECT ConsumerID
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (checkUser.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ================= UPDATE PROFILE =================

    await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .input("PhoneNo", sql.VarChar, email || "")
      .input("MobileNo", sql.VarChar, phone || "")
      .input("Country", sql.VarChar, country || "")
      .input("City", sql.VarChar, city || "")
      .input("Name", sql.VarChar, name || "")
      .input("State", sql.VarChar, state || "")
      .input("PinCode", sql.VarChar, pincode || "")
      .input("Sex", sql.VarChar, gender || "")
      .input("Address", sql.VarChar, address || "").query(`
        UPDATE Member_Details
        SET
          PhoneNo = @PhoneNo,
          MobileNo = @MobileNo,
          Address = @Address,
          Country = @Country,
          City = @City,
          Name = @Name,
          State = @State,
          PinCode = @PinCode,
          Sex = @Sex
        WHERE ConsumerID = @MID
      `);

    // ================= RESPONSE =================

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.log("UPDATE PROFILE ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { MID, currentPassword, newPassword } = req.body;

    // ================= VALIDATION =================

    if (!MID || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const pool = await poolPromise;

    // ================= GET USER =================

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT Password
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const dbPassword = result.recordset[0].Password;

    // ================= CHECK PASSWORD =================

    const isMatch = await bcrypt.compare(currentPassword, dbPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // ================= HASH NEW PASSWORD =================

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ================= UPDATE PASSWORD =================

    await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .input("Password", sql.VarChar, hashedPassword).query(`
        UPDATE Member_Details
        SET Password = @Password
        WHERE ConsumerID = @MID
      `);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log("CHANGE PASSWORD ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getP2pLedgerReport = async (req, res) => {
  try {
    const MID = req.query.MID;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT TOP (100000)
          [ID],
          [MID],
          [Name],
          [pDate],
          [qty],
          [Amount],
          [type],
          [Remarks],
          [tType],
          [transID],
          [cRate],
          [TRX],
          [bal]
        FROM [mlm_jbmglobal].[dbo].[ledger]
        WHERE MID = @MID
          AND transID = 'by Transfer'
        ORDER BY pDate DESC
      `);

    const rows = result.recordset;

    // ================= TOTAL =================
    const totalAmount = rows.reduce(
      (sum, item) => sum + Number(item.Amount || 0),
      0,
    );

    const totalQty = rows.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    return res.json({
      success: true,
      summary: {
        MID,
        totalRecords: rows.length,
        totalAmount,
        totalQty,
      },
      data: rows,
    });
  } catch (err) {
    console.log("Ledger Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCommissionHistoryAll = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP (100000)
        c.[Id],
        c.[Payoutdate],
        c.[Payoutstartdate],
        c.[PayoutEnddate],
        c.[Consumerid],
        c.[Name] AS ConsumerName,
        c.[Lavel],
        m.[Name] AS MemberName,
        c.[lavelcosumied],
        c.[Totalbv],
        c.[Percent],
        c.[Levelincome],
        c.[Totalmember],
        c.[PayoutType]
      FROM [Comission] c
      LEFT JOIN [member_details] m
        ON c.[lavelcosumied] = m.[Consumerid]
      ORDER BY c.[Payoutdate] DESC
    `);

    const rows = result.recordset;

    // ================= TOTAL INCOME =================
    const totalIncome = rows.reduce(
      (sum, item) => sum + Number(item.Levelincome || 0),
      0,
    );

    return res.json({
      success: true,
      summary: {
        totalRecords: rows.length,
        totalIncome,
      },
      data: rows,
    });
  } catch (err) {
    console.log("Commission Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getGrowthIncomeHistoryAll = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP (100000)
        [ID],
        [MID],
        [Name],
        [pDate],
        [Day],
        [Amount],
        [ServiceCharge],
        [TDS],
        [NetAmount],
        [Status],
        [HashID],
        [USDT],
        [Pol]
      FROM [Growth_Income]
      ORDER BY [pDate] DESC
    `);

    const rows = result.recordset;

    // ================= SUMMARY =================
    const totalGross = rows.reduce(
      (sum, item) => sum + Number(item.Amount || 0),
      0,
    );

    const totalNet = rows.reduce(
      (sum, item) => sum + Number(item.NetAmount || 0),
      0,
    );

    const totalTDS = rows.reduce((sum, item) => sum + Number(item.TDS || 0), 0);

    const totalService = rows.reduce(
      (sum, item) => sum + Number(item.ServiceCharge || 0),
      0,
    );

    const paid = rows.filter((x) => x.Status === "Paid").length;
    const pending = rows.filter((x) => x.Status !== "Paid").length;

    return res.json({
      success: true,
      summary: {
        totalRecords: rows.length,
        totalGross,
        totalNet,
        totalTDS,
        totalService,
        paid,
        pending,
      },
      data: rows,
    });
  } catch (err) {
    console.log("Growth Income Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getP2pLedgerReportAll = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP (100000)
        l.[ID],
        l.[MID],
        l.[Name],
        l.[pDate],
        l.[qty],
        l.[Amount],
        l.[type],
        l.[Remarks],
        l.[tType],
        l.[transID],
        l.[cRate],
        l.[TRX],
        l.[bal]
      FROM [ledger] l
      LEFT JOIN [member_details] m
        ON l.[MID] = m.[Consumerid]
      WHERE l.transID = 'by Transfer'
      ORDER BY l.pDate DESC
    `);

    const rows = result.recordset;

    // ================= SUMMARY =================
    const totalAmount = rows.reduce(
      (sum, item) => sum + Number(item.Amount || 0),
      0,
    );

    const totalQty = rows.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    const credit = rows.filter((x) => x.tType === "Credit").length;
    const debit = rows.filter((x) => x.tType === "Debit").length;

    return res.json({
      success: true,
      summary: {
        totalRecords: rows.length,
        totalAmount: Number(totalAmount.toFixed(2)),
        totalQty: Number(totalQty.toFixed(2)),
        credit,
        debit,
      },
      data: rows,
    });
  } catch (err) {
    console.log("Ledger Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getSponsorById = async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, msg: "userId is required" });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("UserId", sql.VarChar, userId)
      .query(`
       SELECT ID, ConsumerID, Name
       FROM Member_Details
       WHERE ConsumerID = @UserId
     `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    return res.status(200).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.log("Sponsor Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
