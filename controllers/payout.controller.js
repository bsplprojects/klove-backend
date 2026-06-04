const sql = require("mssql");
const { poolPromise } = require("../config/db");

const getPayoutHistory = async (req, res) => {
  try {
    const MID = req.params.MID;
    if (!MID) {
      return res.status(400).json({ success: false, msg: "MID is required" });
    }

    const pool = await poolPromise;

    const result = await pool.request().input("MID", sql.VarChar, MID).query(`
      SELECT * FROM Payout WHERE MID = @MID
    `);

    return res.status(200).json({ success: true, data: result.recordset });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getPayoutHistory,
};
