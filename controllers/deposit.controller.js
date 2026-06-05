const sql = require("mssql");
const { poolPromise } = require("../config/db");

const insertDeposit = async (req, res) => {
  try {
    const pool = await poolPromise;

    const { txnNo, currency, amount, MID } = req.body;
    const file = req.file;

    if (!txnNo || !currency || !amount || !MID) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const member = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`SELECT Name FROM Member_Details WHERE ConsumerID = @MID`);

    if (!member.recordset.length) {
      return res.status(400).json({
        success: false,
        message: "Member not found",
      });
    }

    const filePath = file ? `uploads/${file.filename}` : null;

    await pool
      .request()
      .input("txnNo", sql.VarChar, txnNo)
      .input("Name", sql.VarChar, member.recordset[0].Name)
      .input("currency", sql.VarChar, currency)
      .input("amount", sql.Decimal(18, 2), amount)
      .input("MID", sql.VarChar, MID)
      .input("Status", sql.VarChar, "pending")
      .input("file", sql.VarChar, filePath).query(`
        INSERT INTO AddFundRequest
        (tNo, Name, Method, Amount, MID, ImageUrl, Status)
        VALUES
        (@txnNo, @Name,@currency, @amount, @MID, @file, @Status)
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
