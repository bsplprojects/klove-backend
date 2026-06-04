const sql = require("mssql");
const { poolPromise } = require("../config/db");

const insertDeposit = async (req, res) => {
  try {
    const pool = await poolPromise;

    const { txnNo, currency, amount, MID } = req.body;
    const file = req.file;

    // ================= VALIDATION =================
    if (!txnNo || !currency || !amount || !MID) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // ================= FILE HANDLING =================
    const filePath = file ? file.path : null;

    // ================= INSERT QUERY =================
    await pool
      .request()
      .input("txnNo", sql.VarChar, txnNo)
      .input("currency", sql.VarChar, currency)
      .input("amount", sql.Decimal(18, 2), amount)
      .input("MID", sql.VarChar, MID)
      .input("Status", sql.VarChar, "pending")
      .input("file", sql.VarChar, filePath).query(`
        INSERT INTO AddFundRequest
        (tNo, Method, Amount, MID, ImageUrl, Status)
        VALUES
        (@txnNo, @currency, @amount, @MID, @file, @Status)
      `);

    return res.status(200).json({
      success: true,
      message: "Deposit request submitted successfully",
    });
  } catch (error) {
    console.log("INSERT DEPOSIT ERROR =>", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  insertDeposit,
};
