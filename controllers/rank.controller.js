const sql = require("mssql");
const { poolPromise } = require("../config/db");

// ======================================================
// DOWNLINE BUSINESS
// ======================================================
async function memberDownlineBusiness(MID) {
  const pool = await poolPromise;

  let totalBusiness = 0;
  let currentMembers = [MID];

  while (currentMembers.length > 0) {
    const memberList = currentMembers.map((m) => `'${m}'`).join(",");

    const downlineResult = await pool.request().query(`
      SELECT ConsumerID
      FROM Member_Details
      WHERE SponsorId IN (${memberList})
    `);

    if (downlineResult.recordset.length === 0) {
      break;
    }

    let nextMembers = [];

    for (const row of downlineResult.recordset) {
      const childMID = row.ConsumerID;

      nextMembers.push(childMID);

      const topupResult = await pool.request().query(`
        SELECT ISNULL(SUM(amount),0) as total
        FROM Topup
        WHERE MID='${childMID}'
      `);

      totalBusiness += Number(topupResult.recordset[0].total || 0);
    }

    currentMembers = nextMembers;
  }

  return totalBusiness;
}

// ======================================================
// GET DIRECT LEGS
// ======================================================
async function getLegBusiness(MID) {
  const pool = await poolPromise;

  const directResult = await pool.request().query(`
    SELECT ConsumerID, Name
    FROM Member_Details
    WHERE SponsorId='${MID}'
  `);

  let legs = [];
  console.log(MID);
  for (const user of directResult.recordset) {
    // =========================================
    // SELF BUSINESS
    // =========================================
    const selfResult = await pool.request().query(`
      SELECT ISNULL(SUM(amount),0) as total
      FROM Topup
      WHERE MID='${user.ConsumerID}'
    `);

    const selfBusiness = Number(selfResult.recordset[0].total || 0);

    // =========================================
    // TEAM BUSINESS
    // =========================================
    const teamBusiness = await memberDownlineBusiness(user.ConsumerID);

    const totalBusiness = selfBusiness + teamBusiness;

    legs.push({
      MID: user.ConsumerID,
      Name: user.Name,
      totalBusiness,
    });
  }

  // =========================================
  // SORT DESC
  // =========================================
  legs.sort((a, b) => b.totalBusiness - a.totalBusiness);

  return legs;
}

// ======================================================
// GET RANK POOL
// ======================================================
const getRankPool = async (req, res) => {
  try {
    const { MID } = req.params;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    // =========================================
    // MEMBER NAME
    // =========================================
    const memberResult = await pool.request().input("MID", sql.VarChar, MID)
      .query(`
        SELECT TOP 1 Name
        FROM Member_Details
        WHERE ConsumerID=@MID
      `);

    const memberName = memberResult.recordset[0]?.Name || "";

    // =========================================
    // LEGS
    // =========================================
    const legs = await getLegBusiness(MID);

    // =========================================
    // STRONG LEG
    // =========================================
    const strongLeg = legs[0]?.totalBusiness || 0;

    // =========================================
    // OTHER BUSINESS
    // =========================================
    let otherBusiness = 0;

    for (let i = 1; i < legs.length; i++) {
      otherBusiness += legs[i].totalBusiness;
    }

    // =========================================
    // SELF WALLET
    // =========================================
    const selfWalletResult = await pool.request().input("MID", sql.VarChar, MID)
      .query(`
        SELECT ISNULL(SUM(amount),0) as total
        FROM Topup
        WHERE MID=@MID
      `);

    const selfWallet = Number(selfWalletResult.recordset[0].total || 0);

    // =========================================
    // RANKS
    // =========================================
    const ranks = [
      {
        rank: "OX1",
        business: "$1000 / $1000",
        strongBusiness: 1000,
        otherBusiness: 1000,
        percent: "20%",
        reward: 75,
        bonus: "$100",
        selfWalletNeed: 100,
        profit: "0.8% - 1.3%",
      },
      {
        rank: "OX2",
        business: "$5000 / $5000",
        strongBusiness: 5000,
        otherBusiness: 5000,
        percent: "20%",
        reward: 300,
        bonus: "$500",
        selfWalletNeed: 500,
        profit: "0.9% - 1.5%",
      },
      {
        rank: "OX3",
        business: "$20000 / $20000",
        strongBusiness: 20000,
        otherBusiness: 20000,
        percent: "22% - 25%",
        reward: 1250,
        bonus: "$1000",
        selfWalletNeed: 1000,
        profit: "1% - 1.75%",
      },
      {
        rank: "OX4",
        business: "$50000 / $50000",
        strongBusiness: 50000,
        otherBusiness: 50000,
        percent: "25% - 30%",
        reward: 4000,
        bonus: "$2000",
        selfWalletNeed: 2000,
        profit: "1.25% - 2%",
      },
      {
        rank: "OX5",
        business: "$150K / $150K",
        strongBusiness: 150000,
        otherBusiness: 150000,
        percent: "25% - 30%",
        reward: 12500,
        bonus: "$3000",
        selfWalletNeed: 3000,
        profit: "1.5% - 2.5%",
      },
      {
        rank: "OX6",
        business: "$400K / $400K",
        strongBusiness: 400000,
        otherBusiness: 400000,
        percent: "27% - 30%",
        reward: 30000,
        bonus: "$4000",
        selfWalletNeed: 4000,
        profit: "1.7% - 2.5%",
      },
      {
        rank: "OX7",
        business: "$1000K / $1000K",
        strongBusiness: 1000000,
        otherBusiness: 1000000,
        percent: "30% - 35%",
        reward: 75000,
        bonus: "$5000",
        selfWalletNeed: 5000,
        profit: "2% - 3%",
      },
      {
        rank: "OX8",
        business: "$2500K / $2500K",
        strongBusiness: 2500000,
        otherBusiness: 2500000,
        percent: "33% - 40%",
        reward: 200000,
        bonus: "$10000",
        selfWalletNeed: 10000,
        profit: "2.5% - 4%",
      },
    ];

    let finalRanks = [];

    // =========================================
    // LOOP RANKS
    // =========================================
    for (const rank of ranks) {
      // =========================================
      // ELIGIBLE CHECK
      // =========================================
      const achieved =
        strongLeg >= rank.strongBusiness &&
        otherBusiness >= rank.otherBusiness &&
        selfWallet >= rank.selfWalletNeed;

      // =========================================
      // ALREADY EXIST CHECK
      // =========================================
      const alreadyResult = await pool
        .request()
        .input("MID", sql.VarChar, MID)
        .input("RANK", sql.VarChar, rank.rank).query(`
          SELECT TOP 1 *
          FROM reward_nxtStep
          WHERE MID=@MID
          AND remarks=@RANK
          ORDER BY ID DESC
        `);

      let achievedDate = null;

      if (alreadyResult.recordset.length > 0) {
        achievedDate = alreadyResult.recordset[0].issueDAte;
      }

      // =========================================
      // INSERT REWARD
      // =========================================
      if (achieved && alreadyResult.recordset.length === 0) {
        await pool
          .request()
          .input("MID", sql.VarChar, MID)
          .input("NAME", sql.VarChar, memberName)
          .input("LEFTBUS", sql.Float, strongLeg)
          .input("RIGHTBUS", sql.Float, otherBusiness)
          .input("REWARD", sql.Float, rank.reward)
          .input("STATUS", sql.VarChar, "Achieved")
          .input("RANK", sql.VarChar, rank.rank)
          .input("BONUS", sql.VarChar, rank.bonus).query(`
            INSERT INTO reward_nxtStep
            (
              MID,
              Name,
              sDate,
              tDate,
              cDate,
              cLeft,
              cRight,
              pair,
              Reward,
              status,
              transID,
              remarks,
              rLevel,
              issueDAte,
              rewardName
            )
            VALUES
            (
              @MID,
              @NAME,
              GETDATE(),
              GETDATE(),
              GETDATE(),
              @LEFTBUS,
              @RIGHTBUS,
              1,
              @REWARD,
              @STATUS,
              '',
              @RANK,
              1,
              GETDATE(),
              @BONUS
            )
          `);

        achievedDate = new Date();
      }

      // =========================================
      // FINAL DATA
      // =========================================
      finalRanks.push({
        rank: rank.rank,
        business: rank.business,

        // REQUIRED
        strongRequired: rank.strongBusiness,
        otherRequired: rank.otherBusiness,
        selfRequired: rank.selfWalletNeed,

        // CURRENT
        currentStrong: strongLeg,
        currentOther: otherBusiness,
        currentSelf: selfWallet,

        percent: rank.percent,
        bonus: rank.bonus,
        profit: rank.profit,
        reward: rank.reward,
        status: achieved ? "Achieved" : "Locked",

        date: achievedDate,
      });
    }

    return res.json({
      success: true,
      strongLeg,
      otherBusiness,
      selfWallet,
      data: finalRanks,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { getRankPool, memberDownlineBusiness, getLegBusiness };
