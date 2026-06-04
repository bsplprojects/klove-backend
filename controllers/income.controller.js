const sql = require("mssql");
const { poolPromise } = require("../config/db");

const getROIIncomeHistory = async (req, res) => {
  try {
    const MID = req.params.MID;

    if (!MID) {
      return res
        .status(400)
        .json({ success: false, message: "MID is required" });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`SELECT * FROM Growth_Income WHERE MID = @MID`);

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getLevelIncomeHistory = async (req, res) => {
  try {
    const MID = req.params.MID;
    if (!MID) {
      return res.status(400).json({ success: false, msg: "MID is required" });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
      SELECT * FROM Comission WHERE Consumerid = @MID
    `);

    return res.status(200).json({ success: true, data: result.recordset });
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
