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

    // IF currency is usdt multiply it by 100 otherwise leave
    let amountToInsert = amount;
    if (currency === "USDT") {
      amountToInsert = Number(amount) * 100;
    }

    // check if txnNo already exists
    const existingTxnNo = await pool
      .request()
      .input("txnNo", sql.VarChar, txnNo)
      .query(`SELECT COUNT(*) AS count FROM AddFundRequest WHERE tNo = @txnNo`);

    if (existingTxnNo.recordset[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: "Transaction number already exists",
      });
    }

    await pool
      .request()
      .input("txnNo", sql.VarChar, txnNo)
      .input("Name", sql.VarChar, member.recordset[0].Name)
      .input("currency", sql.VarChar, currency)
      .input("amount", sql.Decimal(18, 2), amountToInsert)
      .input("MID", sql.VarChar, MID)
      .input("Status", sql.VarChar, "pending")
      .input(
        "Remark",
        sql.VarChar,
        currency === "USDT" ? "1 usdt = 100 inr converted" : "",
      )
      .input("file", sql.VarChar, filePath).query(`
        INSERT INTO AddFundRequest
        (tNo, Name, Method, Amount, MID, ImageUrl, Status, Remark)
        VALUES
        (@txnNo, @Name,@currency, @amount, @MID, @file, @Status, @Remark)
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
