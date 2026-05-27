import sql from "mssql";
import { poolPromise } from "../config/db.js";

// ================= SHOW DIRECT TEAM =================
export const showDirectTeam = async (req, res) => {
  try {
    const { userName } = req.params;

    // CHECK USERNAME
    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required",
      });
    }

    const pool = await poolPromise;

    // ================= GET DIRECT MEMBERS =================
    const memberResult = await pool
      .request()
      .input("ReferralId", sql.VarChar, userName)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE SponsorId = @ReferralId
        ORDER BY JoiningDate DESC
      `);

    const members = memberResult.recordset;

    let finalData = [];

    // ================= MEMBER LOOP =================
    for (const member of members) {
      // TOTAL TOPUP OF MEMBER
      const topupResult = await pool
        .request()
        .input("MID", sql.VarChar, member.ConsumerID)
        .query(`
          SELECT
            ISNULL(SUM(amount), 0) AS TotalTopup,
            MAX(pDate) AS LastTopupDate
          FROM TopUp
          WHERE MID = @MID
        `);

      const topup = topupResult.recordset[0];

      // PUSH SINGLE RECORD
      finalData.push({
        ConsumerID: member.ConsumerID,
        Name: member.Name,
        MobileNo: member.MobileNo,
        JoiningDate: member.JoiningDate,
Address: member.Address,
        TotalTopup: topup.TotalTopup || 0,
        LastTopupDate: topup.LastTopupDate || null,

        Status: topup.TotalTopup > 0 ? "Active" : "Inactive",
      });
    }

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      totalMembers: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("ShowDirectTeam Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// ================= MEMBER DOWNLINE DETAILS WITH LEVEL =================
export const memberDownlineDetailsWithLevel = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const pool = await poolPromise;

    let finalData = [];
    let srno = 0;

    // ================= ROOT MEMBER =================
    const rootResult = await pool
      .request()
      .input("ConsumerId", sql.VarChar, userId)
      .query(`
        SELECT 
          ConsumerID,
          Name,
          JoiningDate,
          Price,
          Joining_Comp_Level,
          SponsorId,
          Address
        FROM Member_Details
        WHERE ConsumerID = @ConsumerId
      `);

    if (rootResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    // ================= BFS VARIABLES =================
    let currentIds = [userId];
    let level = 1;

    // ================= LOOP ALL LEVELS =================
    while (currentIds.length > 0) {
      const idsString = currentIds.map((id) => `'${id}'`).join(",");

      // GET CHILD MEMBERS
      const downlineResult = await pool.request().query(`
        SELECT
          ConsumerID,
          Name,
          JoiningDate,
          Price,
          Joining_Comp_Level,
          SponsorId,
          MobileNo,
          Address
        FROM Member_Details
        WHERE SponsorId IN (${idsString})
      `);

      const members = downlineResult.recordset;

      // STOP IF NO DATA
      if (members.length === 0) {
        break;
      }

      // NEXT LEVEL IDS
      currentIds = [];

      // ================= MEMBER LOOP =================
      for (const member of members) {
        currentIds.push(member.ConsumerID);

        // TOTAL TOPUP
        const topupResult = await pool
          .request()
          .input("MID", sql.VarChar, member.ConsumerID)
          .query(`
            SELECT ISNULL(SUM(amount),0) AS TotalTopup
            FROM TopUp
            WHERE MID = @MID
          `);

        const totalTopup =
          topupResult.recordset[0]?.TotalTopup || 0;

        srno++;

        finalData.push({
          Srno: srno,
          ConsumerId: member.ConsumerID,
          ConsumerName: member.Name,

          JoiningDate: member.JoiningDate
            ? new Date(member.JoiningDate).toLocaleString(
                "en-IN",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                }
              )
            : "",

          Amount: totalTopup,
          Level: level,
address:member.Address,
          ActiveDate: member.Joining_Comp_Level,
          SponsorId: member.SponsorId,
          MobileNo: member.MobileNo,

          Status: totalTopup > 0 ? "Active" : "Inactive",
        });
      }

      // NEXT LEVEL
      level++;
    }

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      total: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.log("DOWNLINE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};


export const updateMyRank = async (req, res) => {
  try {

    const pool = await poolPromise;

    const { memberId } = req.body;

    // direct active with topup >= 50
    const directRes = await pool.request()
      .input("mid", memberId)
      .query(`
        SELECT COUNT(*) AS total
        FROM Member_Details
        WHERE SponsorId = @mid
        AND mStatus = 'Active'
        AND Price >= 50
      `);

    const totalDirect = directRes.recordset[0].total;

    // existing ranks from reward_nxtStep
    const rankRes = await pool.request()
      .input("mid", memberId)
      .query(`
        SELECT remarks
        FROM reward_nxtStep
        WHERE MID = @mid
      `);

    const ranks = rankRes.recordset.map(r => r.remarks);

    let rank = "";
    let percentage = 0;

    // rank check from remarks
    if (ranks.includes("OX2")) {

      rank = "OX2";
      percentage = 1;

    }
    else if (ranks.includes("OX1")) {

      rank = "OX1";
      percentage = 2;

    }
    else if (totalDirect >= 8) {

      rank = "DIRECT";
      percentage = 3;

    }

    // update rank + percentage
if (rank !== "") {

  await pool.request()
    .input("mid", memberId)
    .input("rank", rank)
    .input("percentage", percentage)
    .query(`
      UPDATE Member_Details
      SET 
        Cr_Level = @rank,
        Joining_Comp_Level = @percentage
      WHERE MID = @mid
    `);

}

    res.send({
      success: true,
      rank,
      percentage,
      totalDirect
    });

  } catch (err) {

    console.log(err);

    res.send({
      success: false
    });

  }
};