import sql from "mssql";
import { poolPromise } from "../config/db.js";

const levelPayout = async (MID, amt) => {
  try {
    const pool = await poolPromise;

    // ===== USER DETAILS =====
    const member = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT ConsumerID, Name
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (!member.recordset.length) return;

    let currentMID = member.recordset[0].ConsumerID;

    // ===== LEVEL LOOP (1-10) =====
    for (let level = 1; level <= 10; level++) {
      // ===== FIND SPONSOR =====
      const sponsorRes = await pool
        .request()
        .input("MID", sql.VarChar, currentMID)
        .query(`
          SELECT SponsorId
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      if (!sponsorRes.recordset.length) break;

      const toMID = sponsorRes.recordset[0]?.SponsorId;

      if (!toMID) break;

      // Move to next upline
      currentMID = toMID;

      // ===== GET SPONSOR NAME =====
      const nameRes = await pool
        .request()
        .input("MID", sql.VarChar, toMID)
        .query(`
          SELECT Name
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      const toName = nameRes.recordset[0]?.Name || "";

      // ===== LEVEL PERCENTAGE =====
      let percent = 0;

      switch (level) {
        case 1:
          percent = 0.1; // 10%
          break;
        case 2:
          percent = 0.05; // 5%
          break;
        case 3:
          percent = 0.03; // 3%
          break;
        case 4:
          percent = 0.02; // 2%
          break;
        default:
          percent = 0.01; // 1% (Level 5-10)
      }

      const levelIncome = Number(amt) * percent;

      // ===== ACTIVE MEMBER CHECK =====
      const topup = await pool
        .request()
        .input("MID", sql.VarChar, toMID)
        .query(`
          SELECT TOP 1 MID
          FROM TopUp
          WHERE MID = @MID
            AND Amount > 0
        `);

      // Sponsor inactive -> skip income
      if (!topup.recordset.length) continue;

      // ===== INSERT COMMISSION =====
      await pool
        .request()
        .input("Consumerid", sql.VarChar, toMID)
        .input("Name", sql.VarChar, toName)
        .input("Level", sql.Int, level)
        .input("FromMID", sql.VarChar, MID)
        .input("TotalBV", sql.Decimal(18, 2), Number(amt))
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

      console.log(
        `Level ${level} Income Added | To: ${toMID} | Amount: ${levelIncome}`
      );
    }
  } catch (err) {
    console.error("Level payout error:", err);
    throw err;
  }
};

export default levelPayout;