

const sql = require("mssql");
const { poolPromise } = require("../config/db");

const updateMyRank = async (memberId) => {

  try {

    const pool = await poolPromise;

    // =========================
    // TOTAL ACTIVE DIRECT
    // =========================
    const directRes = await pool.request()
      .input("mid", sql.VarChar, memberId)
      .query(`
        SELECT COUNT(*) AS total
        FROM Member_Details
        WHERE SponsorId = @mid
        AND mStatus = 'Active'
        AND Price >= 50
      `);

    const totalDirect = directRes.recordset[0].total;

    // =========================
    // DIRECT OX1 COUNT
    // =========================
    const ox1Res = await pool.request()
      .input("mid", sql.VarChar, memberId)
      .query(`
        SELECT COUNT(*) AS total
        FROM Member_Details md
        INNER JOIN reward_nxtStep r
          ON md.ConsumerID = r.MID
        WHERE md.SponsorId = @mid
        AND r.remarks = 'OX1'
      `);

    const totalOX1 = ox1Res.recordset[0].total;

    // =========================
    // DIRECT OX2 COUNT
    // =========================
    const ox2Res = await pool.request()
      .input("mid", sql.VarChar, memberId)
      .query(`
        SELECT COUNT(*) AS total
        FROM Member_Details md
        INNER JOIN reward_nxtStep r
          ON md.ConsumerID = r.MID
        WHERE md.SponsorId = @mid
        AND r.remarks = 'OX2'
      `);

    const totalOX2 = ox2Res.recordset[0].total;

    let rank = "";
    let percentage = 0;

    // =========================
    // RANK CHECK
    // =========================
    if (totalOX2 >= 3) {

      rank = "OX2";
      percentage = 2;

    }
    else if (totalOX1 >= 2) {

      rank = "OX1";
      percentage = 1;

    }
    else if (totalDirect >= 8) {

      rank = "DIRECT";
      percentage = 3;

    }

    // =========================
    // UPDATE MEMBER
    // =========================
    if (rank !== "") {

      await pool.request()
        .input("mid", sql.VarChar, memberId)
        .input("rank", sql.VarChar, rank)
        .input("percentage", sql.Float, percentage)
        .query(`
          UPDATE Member_Details
          SET 
            Cr_Level = @percentage,
            Product_Name = @rank
          WHERE ConsumerID = @mid
        `);

    }

    return {
      success: true,
      rank,
      percentage,
      totalDirect,
      totalOX1,
      totalOX2
    };

  } catch (err) {

    console.log(err);

    return {
      success: false
    };

  }
};

module.exports = {
  updateMyRank
};