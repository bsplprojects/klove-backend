const sql = require("mssql");
const { poolPromise } = require("../config/db");

// ==================== ROI LEVEL PAYOUT ====================
const roiLevelPayout = async (MID, amt) => {
  try {

    const pool = await poolPromise;

    // =========================
    // VALIDATION
    // =========================
    if (!MID || !amt || amt <= 0) {
      return {
        success: false,
        message: "Invalid MID or Amount",
      };
    }

    // =========================
    // MEMBER DETAILS
    // =========================
    const memberResult = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT ConsumerID
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (memberResult.recordset.length === 0) {
      return {
        success: false,
        message: "Member not found",
      };
    }

    const member = memberResult.recordset[0];

    // =========================
    // START FROM MEMBER
    // =========================
    let SpID = member.ConsumerID;

    let level = 0;

    // =========================
    // LOOP PROTECTION
    // =========================
    const visited = new Set();

    // =========================
    // MAX 10 LEVEL
    // =========================
    while (level < 10) {

      level++;

      // =========================
      // CIRCULAR LOOP PROTECTION
      // =========================
      if (visited.has(SpID)) {
        console.log("Circular referral detected:", SpID);
        break;
      }

      visited.add(SpID);

      // =========================
      // GET SPONSOR
      // =========================
      const sponsorResult = await pool
        .request()
        .input("SpID", sql.VarChar, SpID)
        .query(`
          SELECT
            ReferralId
          FROM Member_Details
          WHERE ConsumerID = @SpID
        `);

      if (sponsorResult.recordset.length === 0) {
        break;
      }

      const sponsor = sponsorResult.recordset[0];

      // =========================
      // NEXT UPLINE
      // =========================
      SpID = sponsor.ReferralId || "";

      if (!SpID) {
        break;
      }

      // =========================
      // ACTIVE USER CHECK
      // =========================
      const activeResult = await pool
        .request()
        .input("MID", sql.VarChar, SpID)
        .query(`
          SELECT TOP 1 MID
          FROM TopUp
          WHERE MID = @MID
            AND Amount > 0
        `);

      // inactive sponsor skip
      if (activeResult.recordset.length === 0) {
        continue;
      }

      // =========================
      // GET TOP RANK
      // =========================
      const rewardResult = await pool
        .request()
        .input("MID", sql.VarChar, SpID)
        .query(`
          SELECT TOP 1 remarks
          FROM reward_nxtStep
          WHERE MID = @MID
          ORDER BY 
            CASE remarks
              WHEN 'OX8' THEN 8
              WHEN 'OX7' THEN 7
              WHEN 'OX6' THEN 6
              WHEN 'OX5' THEN 5
              WHEN 'OX4' THEN 4
              WHEN 'OX3' THEN 3
              WHEN 'OX2' THEN 2
              WHEN 'OX1' THEN 1
              ELSE 0
            END DESC
        `);

      const rank = rewardResult.recordset[0]?.remarks || "";

      // =========================
      // PERCENT BY RANK
      // =========================
      let percent = 0;

      switch (rank) {

        case "OX1":
          percent = 15;
          break;

        case "OX2":
          percent = 20;
          break;

        case "OX3":
          percent = 25;
          break;

        case "OX4":
          percent = 30;
          break;

        case "OX5":
          percent = 30;
          break;

        case "OX6":
          percent = 35;
          break;

        case "OX7":
          percent = 40;
          break;

        case "OX8":
          percent = 45;
          break;

        default:
          percent = 0;
      }

      // =========================
      // CALCULATE COMMISSION
      // =========================
      const levelAmt = Number(
        ((amt * percent) / 100).toFixed(2)
      );

      // =========================
      // SKIP ZERO
      // =========================
      if (levelAmt <= 0) {
        continue;
      }

      // =========================
      // INSERT COMMISSION
      // =========================
      await pool
        .request()
        .input("MID", sql.VarChar, SpID)
        .input("Level", sql.Int, level)
        .input("FromMID", sql.VarChar, member.ConsumerID)
        .input("Amount", sql.Decimal(18, 2), levelAmt)
        .query(`
          INSERT INTO Comissionref (
            EntryDate,
            ClosingDate,
            CreatedDate,
            MID,
            Level,
            FromMID,
            Status,
            DirectLevel,
            Amount,
            IsPaid,
            Remark
          )
          VALUES (
            GETDATE(),
            GETDATE(),
            GETDATE(),
            @MID,
            @Level,
            @FromMID,
            1,
            @Level,
            @Amount,
            0,
            'ROI LEVEL'
          )
        `);

      console.log(
        `ROI LEVEL ${level} => ${SpID} received ${levelAmt}`
      );
    }

    return {
      success: true,
      message: "ROI level payout distributed successfully",
    };

  } catch (err) {

    console.log("ROI LEVEL ERROR:", err);

    return {
      success: false,
      message: err.message,
    };
  }
};

module.exports = {
  roiLevelPayout,
};