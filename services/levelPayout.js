const sql = require("mssql");

/* ================= TOPUP FROM SP ================= */
async function getTopupAmount(userId, transaction) {
  const result = await new sql.Request(transaction)
    .input("UserId", sql.VarChar, userId)
    .execute("Get_MyFundWallet");

  const data = result.recordset || [];
  return Number(data[0]?.Balance || 0);
}

/* ================= DOWNLINE COUNT ================= */
async function getDownlineCount(MID, transaction) {
  const result = await new sql.Request(transaction)
    .input("MID", sql.VarChar, MID)
    .query(`
      WITH Downline AS (
          SELECT ConsumerID
          FROM Member_Details
          WHERE ConsumerID = @MID

          UNION ALL

          SELECT m.ConsumerID
          FROM Member_Details m
          INNER JOIN Downline d ON m.SponsorId = d.ConsumerID
      )
      SELECT COUNT(*) - 1 AS TotalDownline
      FROM Downline;
    `);

  return result.recordset[0]?.TotalDownline || 0;
}

/* ================= DIRECT COUNT ================= */
async function getDirectCount(MID, transaction) {
  const result = await new sql.Request(transaction)
    .input("MID", sql.VarChar, MID)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM Member_Details
      WHERE SponsorId = @MID
    `);

  return result.recordset[0]?.cnt || 0;
}

/* ================= LEVEL ELIGIBILITY ================= */
async function checkLevelCondition(MID, level, transaction) {
  const directCount = await getDirectCount(MID, transaction);
  const downlineCount = await getDownlineCount(MID, transaction);

  if (level === 1) return true;

  if (level === 2) {
    console.log(directCount, downlineCount);
    return directCount >= 3 && downlineCount >= 2;
  }

  if (level === 3) {
    return directCount >= 5 && downlineCount >= 10;
  }

  if (level === 4) {
    return directCount >= 7 && downlineCount >= 23;
  }

  if (level >= 5 && level <= 10) {
    return directCount >= 10 && downlineCount >= 40;
  }

  return false;
}

/* ================= MAIN PAYOUT ================= */
async function levelPayout(MID, amt, transaction) {
  try {
    const member = await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT ConsumerID
        FROM Member_Details
        WHERE ConsumerID=@MID
      `);

    if (!member.recordset.length) return;

    let SpID = member.recordset[0].ConsumerID;
    let level = 0;
    while (true) {
      level++;

      if (level > 10) break;

      /* ===== GET SPONSOR ===== */
      const sponsor = await new sql.Request(transaction)
        .input("MID", sql.VarChar, SpID)
        .query(`
          SELECT SponsorId
          FROM Member_Details
          WHERE ConsumerID=@MID
        `);
      if (!sponsor.recordset.length) break;

      SpID = sponsor.recordset[0].SponsorId;

      if (!SpID) break;

      /* ================= LEVEL VALIDATION ================= */
      const isEligible = await checkLevelCondition(SpID, level, transaction);
      if (!isEligible) continue;

      /* ================= LEVEL 1 SPECIAL RULE ================= */
      if (level === 1) {

        const selfTopup = await getTopupAmount(MID, transaction);

        if (selfTopup < 100) continue;

        const directList = await new sql.Request(transaction)
          .input("MID", sql.VarChar, SpID)
          .query(`
            SELECT ConsumerID
            FROM Member_Details
            WHERE SponsorId=@MID
          `);

        let totalDirectTopup = 0;

        for (let d of directList.recordset) {
          const topup = await getTopupAmount(d.ConsumerID, transaction);
          totalDirectTopup += topup;
        }
        if (totalDirectTopup < 100) continue;
      }

      /* ================= PERCENT RULE ================= */
      let percent = 0;

      if (level === 1) percent = 0.15;
      else if (level === 2) percent = 0.10;
      else if (level === 3) percent = 0.05;
      else if (level === 4) percent = 0.04;
      else if (level >= 5 && level <= 10) percent = 0.03;

      const levelAmount = amt * percent;

      if (levelAmount <= 0) continue;

      /* ================= SPONSOR ACTIVE CHECK ================= */
      const sponsorTopup = await getTopupAmount(SpID, transaction);
      if (sponsorTopup <= 0) continue;

      /* ================= INSERT COMMISSION ================= */
      await new sql.Request(transaction)
        .input("MID", sql.VarChar, SpID)
        .input("FromMID", sql.VarChar, MID)
        .input("Level", sql.Int, level)
        .input("Amount", sql.Decimal(18, 2), levelAmount)
        .query(`
          INSERT INTO Comission
          (
            Payoutstartdate,
            PayoutDate,
            PayoutEnddate,
            Consumerid,
            Lavel,
            lavelcosumied,
            Levelincome,
            PayoutType
          )
          VALUES
          (
            GETDATE(),
            GETDATE(),
            GETDATE(),
            @MID,
            @Level,
            @FromMID,
            @Amount,
            'LEVEL'
          )
        `);
    }

  } catch (err) {
    console.log("Level payout error:", err.message);
    throw err;
  }
}

module.exports = levelPayout;