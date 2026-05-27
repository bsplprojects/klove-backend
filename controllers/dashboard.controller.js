const { getPool, sql } = require("../config/db");

exports.getDashboard = async (req, res) => {
  try {
    const wallet = req.query.address;

    if (!wallet) {
      return res.status(400).json({
        error: "Wallet address required",
      });
    }

    const pool = await getPool();

    // 🔥 CALL STORED PROCEDURE
    const result = await pool.request()
      .input("userID", sql.VarChar, wallet)
      .execute("Get_MemberDashboard");

    const data = result.recordset[0];

    res.json({
      directCount: data.DirectReferrals,
      teamCount: data.TeamSize,
      TEAM_VOLUME: data.TeamVolume,
      activeStake: data.ActiveStake
    });

  } catch (err) {
    console.log("Dashboard Error:", err);

    res.status(500).json({
      error: "Dashboard API failed"
    });
  }
};