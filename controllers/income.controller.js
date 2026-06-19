const sql = require("mssql");
const { poolPromise } = require("../config/db");

const getROIIncomeHistory = async (req, res) => {
  try {
    const MID = req.params.MID;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    if (!MID) {
      return res
        .status(400)
        .json({ success: false, message: "MID is required" });
    }

    const adminID = MID === "Admin" ? null : MID;

    const pool = await poolPromise;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM Growth_Income
    `;

    let countRequest = pool.request();
    if (adminID !== null) {
      countQuery += ` WHERE MID = @MID`;
      countRequest.input("MID", sql.VarChar, adminID);
    }

    const countResult = await countRequest.query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    let dataQuery = `
      SELECT *
      FROM Growth_Income
    `;

    let dataRequest = pool.request();

    if (adminID !== null) {
      dataQuery += ` WHERE MID = @MID`;
      dataRequest.input("MID", sql.VarChar, adminID);
    }

    dataQuery += `
      ORDER BY Id DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${limit} ROWS ONLY
  `;

    const result = await dataRequest.query(dataQuery);

    let summaryQuery = `
              SELECT
                  ISNULL(SUM(CASE
                      WHEN CAST(pDate AS DATE) = CAST(GETDATE() AS DATE)
                      THEN Amount ELSE 0 END),0) AS todayROI,

                  ISNULL(SUM(CASE
                      WHEN MONTH(pDate) = MONTH(GETDATE())
                      AND YEAR(pDate) = YEAR(GETDATE())
                      THEN Amount ELSE 0 END),0) AS thisMonthROI,

                  ISNULL(SUM(Amount),0) AS lifetimeROI
              FROM Growth_Income
        `;

    let summaryRequest = pool.request();

    if (adminID !== null) {
      summaryQuery += ` WHERE MID = @MID`;
      summaryRequest.input("MID", sql.VarChar, adminID);
    }

    const summaryResult = await summaryRequest.query(summaryQuery);

    return res.status(200).json({
      success: true,
      data: result.recordset,
      summary: summaryResult.recordset[0],
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLevelIncomeHistory = async (req, res) => {
  try {
    const MID = req.params.MID;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const offset = (page - 1) * limit;

    if (!MID) {
      return res.status(400).json({
        success: false,
        msg: "MID is required",
      });
    }

    const adminID = MID === "Admin" ? null : MID;

    const pool = await poolPromise;

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM Comission
    `;

    let dataQuery = `
      SELECT *
      FROM Comission
    `;

    let countRequest = pool.request();
    let dataRequest = pool.request();

    if (adminID !== null) {
      countQuery += ` WHERE ConsumerID = @MID`;
      dataQuery += ` WHERE ConsumerID = @MID`;

      countRequest.input("MID", sql.VarChar, adminID);
      dataRequest.input("MID", sql.VarChar, adminID);
    }

    const countResult = await countRequest.query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    dataQuery += `
        ORDER BY Id DESC
        OFFSET ${offset} ROWS
        FETCH NEXT ${limit} ROWS ONLY
  `;

    const result = await dataRequest.query(dataQuery);

    let summaryQuery = `
              SELECT
                  ISNULL(SUM(CASE
                      WHEN CAST(Payoutdate AS DATE) = CAST(GETDATE() AS DATE)
                      THEN Levelincome ELSE 0 END),0) AS todayLevel,

                  ISNULL(SUM(CASE
                      WHEN MONTH(Payoutdate) = MONTH(GETDATE())
                      AND YEAR(Payoutdate) = YEAR(GETDATE())
                      THEN Levelincome ELSE 0 END),0) AS thisMonthLevel,

                  ISNULL(SUM(Levelincome),0) AS lifetimeLevel
              FROM Comission
        `;

    let summaryRequest = pool.request();

    if (adminID !== null) {
      summaryQuery += ` WHERE Consumerid = @MID`;
      summaryRequest.input("MID", sql.VarChar, adminID);
    }

    const summaryResult = await summaryRequest.query(summaryQuery);

    return res.status(200).json({
      success: true,
      data: result.recordset,
      summary: summaryResult.recordset[0],
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getReferralIncomeHistory = async (req, res) => {
  try {
    const MID = req.params.MID;
    if (!MID) {
      return res.status(400).json({ success: false, msg: "MID is required" });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
      SELECT * FROM SponsorIncome WHERE MID = @MID
    `);

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getROIIncomeHistory,
  getLevelIncomeHistory,
  getReferralIncomeHistory,
};
