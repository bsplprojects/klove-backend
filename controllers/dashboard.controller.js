const { sql, poolPromise } = require("../config/db");

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({
        error: "User Id required",
      });
    }

    const pool = await poolPromise;

    // 🔥 CALL STORED PROCEDURE
    const result = await pool
      .request()
      .input("userID", sql.VarChar, userId)
      .execute("Get_MemberDashboard");

    const data = result.recordset[0];

    res.status(200).json({
      directCount: data.DirectReferrals ?? 0,
      teamCount: data.TeamSize ?? 0,
      TEAM_VOLUME: data.TeamVolume ?? 0,
      activeStake: data.ActiveStake ?? 0,
    });
  } catch (err) {
    console.log("Dashboard Error:", err);

    res.status(500).json({
      error: "Dashboard API failed",
    });
  }
};
