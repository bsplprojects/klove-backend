const sql = require("mssql");

async function levelPayout(MID, amt, transaction) {
  try {

    // ===== USER =====
    const member = await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT ConsumerID, Name
        FROM Member_Details
        WHERE ConsumerID=@MID
      `);

    if (!member.recordset.length) return;

    let currentMID = member.recordset[0].ConsumerID;
    let fromName = member.recordset[0].Name || "";

    // ===== LEVEL LOOP =====
    for (let level = 1; level <= 10; level++) {

      // ===== MOVE UP LINE =====
     const sponsorRes = await new sql.Request(transaction)
  .input("MID", sql.VarChar, currentMID)
  .query(`
    SELECT SponsorId
    FROM Member_Details
    WHERE ConsumerID=@MID
  `);

const toMID = sponsorRes.recordset[0].SponsorId;

if (!toMID) break;

// 🔥 NOW GET SPONSOR NAME SEPARATELY
const nameRes = await new sql.Request(transaction)
  .input("MID", sql.VarChar, toMID)
  .query(`
    SELECT Name
    FROM Member_Details
    WHERE ConsumerID=@MID
  `);

const toName = nameRes.recordset[0]?.Name || "";

      if (!toMID) break;

      currentMID = toMID;

      // ===== LEVEL PERCENTAGE RULE =====
      let percent = 0;

      if (level === 1) percent = 0.10;
      else if (level === 2) percent = 0.05;
      else if (level === 3) percent = 0.03;
      else if (level === 4) percent = 0.02;
      else percent = 0.01; // 5–10

      const levelIncome = amt * percent;

      // ===== ACTIVE CHECK =====
      const topup = await new sql.Request(transaction)
        .input("MID", sql.VarChar, toMID)
        .query(`
          SELECT TOP 1 MID
          FROM TopUp
          WHERE MID=@MID AND amount > 0
        `);

      if (topup.recordset.length > 0) {

        await new sql.Request(transaction)
          .input("Consumerid", sql.VarChar, toMID)
          .input("Name", sql.VarChar, toName)
          .input("Level", sql.Int, level)
          .input("FromMID", sql.VarChar, MID)
          .input("TotalBV", sql.Decimal(18, 2), amt)
          .input("Levelincome", sql.Decimal(18, 2), levelIncome)
          .input("Totalmember", sql.Int, 1)
          .query(`
            INSERT INTO Comission
            (
              Payoutdate,
              Payoutstartdate,
              PayoutEnddate,
              Consumerid,
              Name,
              Lavel,
              lavelcosumied,
              Totalbv,
              Levelincome,
              Totalmember,
              PayoutType
            )
            VALUES
            (
              GETDATE(),
              GETDATE(),
              GETDATE(),
              @Consumerid,
              @Name,
              @Level,
              @FromMID,
              @TotalBV,
              @Levelincome,
              @Totalmember,
              'LEVEL'
            )
          `);
      }

    }

  } catch (err) {
    console.log("Level payout error:", err.message);
    throw err;
  }
}

module.exports = levelPayout;