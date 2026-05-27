const { poolPromise, sql } = require("../config/db");
const crypto = require("crypto");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");



dayjs.extend(utc);
dayjs.extend(timezone);


// ======================================
// EXECUTE TRADE (TRANSACTION SAFE)
// ======================================
exports.executeTrade = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { memberId, coin, coinName, entryPrice, stake } = req.body;

    await transaction.begin();

    const request = new sql.Request(transaction);

    // ================= WALLET FETCH =================
    const walletResult = await request
  .input("userId", sql.VarChar, memberId)
  .execute("Get_MemberDashboard");

    if (!walletResult.recordset.length) {
      await transaction.rollback();
      return res.json({ success: false });
    }

    let wallet = walletResult.recordset[0].TotalInvestment;

// ================= BALANCE CHECK =================
if (stake > wallet) {
  await transaction.rollback();
  return res.json({
    success: false,
    message: "Insufficient Balance",
  });
}

// ================= ROI / MARKET RESULT =================
let minPct, maxPct;

// =========================
// DEFAULT BY WALLET
// =========================
if (wallet >= 50 && wallet <= 2500) {
  minPct = 0.7;
  maxPct = 1.25;

} else if (wallet > 2500) {
  minPct = 1.0;
  maxPct = 1.5;

} else {
  minPct = 0;
  maxPct = 0;
}

// =========================
// GET TOP RANK
// =========================
const rewardCheck = await request
  .input("MID", sql.VarChar, memberId)
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

const rank = rewardCheck.recordset[0]?.remarks || "";

// =========================
// RANK + MIN WALLET CHECK
// =========================
switch (rank) {

  case "OX1":
    if (wallet >= 100) {
      minPct = 0.8;
      maxPct = 1.3;
    }
    break;

  case "OX2":
    if (wallet >= 500) {
      minPct = 0.9;
      maxPct = 1.5;
    }
    break;

  case "OX3":
    if (wallet >= 1000) {
      minPct = 1.0;
      maxPct = 1.75;
    }
    break;

  case "OX4":
    if (wallet >= 2000) {
      minPct = 1.25;
      maxPct = 2;
    }
    break;

  case "OX5":
    if (wallet >= 3000) {
      minPct = 1.5;
      maxPct = 2.5;
    }
    break;

  case "OX6":
    if (wallet >= 4000) {
      minPct = 1.7;
      maxPct = 2.5;
    }
    break;

  case "OX7":
    if (wallet >= 5000) {
      minPct = 2;
      maxPct = 3;
    }
    break;

  case "OX8":
    if (wallet >= 10000) {
      minPct = 2.5;
      maxPct = 4;
    }
    break;
}

// // random win/loss
// const win = Math.random() < 0.75;

// // pnl percentage based on wallet rule
// const basePct = +(Math.random() * (maxPct - minPct) + minPct).toFixed(2);

// const pnlPct = win ? basePct : -basePct;

// ALWAYS PROFIT

const pnlPct = +(
  Math.random() * (maxPct - minPct) + minPct
).toFixed(2);

// ================= TRADE SIDE =================
const side = Math.random() > 0.5 ? "LONG" : "SHORT";

// ================= EXIT PRICE =================
const exitPrice = +(
  entryPrice *
  (1 + (side === "LONG" ? pnlPct : -pnlPct) / 100)
).toFixed(6);

// ================= PNL USD =================
const pnlUsd = +(stake * (pnlPct / 100)).toFixed(2);

// ================= NEW BALANCE =================
const newBalance = +(wallet + pnlUsd).toFixed(2);

    const tradeId = crypto.randomUUID();

    // ================= INSERT HISTORY =================
    await request
    .input("memberId", sql.VarChar, memberId)
      .input("tradeId", sql.VarChar, tradeId)
      .input("coin", sql.VarChar, coin)
      .input("coinName", sql.VarChar, coinName)
      .input("side", sql.VarChar, side)
      .input("stake", sql.Decimal(18, 2), stake)
      .input("pnlPct", sql.Decimal(10, 2), pnlPct)
      .input("pnlUsd", sql.Decimal(18, 2), pnlUsd)
      .input("entry", sql.Decimal(18, 6), entryPrice)
      .input("exit", sql.Decimal(18, 6), exitPrice)
      .query(`
        INSERT INTO AI_TradeHistory
        (HashID, MemberID, Coin, CoinName, Side, Stake, PnlPct, PnlUsd, EntryPrice, ExitPrice, TradeDate,Status)
        VALUES(
          @tradeId,
          @memberId,
          @coin,
          @coinName,
          @side,
          @stake,
          @pnlPct,
          @pnlUsd,
          @entry,
          @exit,
          GETDATE(),
          'Pending'
        )
      `);
       await transaction.commit();
// ================= ROI LEVEL PAYOUT =================

try {

  // ================= ROI LEVEL PAYOUT =================
  if (pnlUsd > 0) {

    const { roiLevelPayout } = require("../services/roiLevelPayout");

    await roiLevelPayout(memberId, pnlUsd);

  }

} catch (roiErr) {

  console.log("ROI PAYOUT ERROR:", roiErr);

}
   

    res.json({
      success: true,
      balance: newBalance,
      trade: {
        id: tradeId,
        symbol: coin,
        coin: coinName,
        side,
        stake,
        pnlPct,
        pnlUsd,
        entry: entryPrice,
        exit: exitPrice,
        ts: Date.now(),
      },
    });

  } catch (err) {
    console.log(err);
    await transaction.rollback();
    res.status(500).json({ success: false });
  }
};

// ======================================
// TRADE HISTORY
// ======================================
exports.getTradeHistory = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { memberId } = req.params;

    const result = await pool.request()
      .input("memberId", sql.VarChar, memberId)
      .query(`
        SELECT
          Id,
          Coin,
          CoinName,
          Side,
          Stake,
          PnlPct,
          PnlUsd,
          EntryPrice,
          ExitPrice,
          TradeDate,
          Status
        FROM AI_TradeHistory
        WHERE MemberID = @memberId
        ORDER BY TradeDate DESC
      `);

            /* ✅ DATE CONVERT HERE */
            const data = result.recordset.map((row) => ({
              ...row,
              pDateFormatted: dayjs(
          row.TradeDate.toISOString().replace("Z", "")
        ).format("DD MMM YYYY, hh:mm A"),
            
            }));
        
            return res.json({
              success: true,
              total: data.length,
              data,
            });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      success: false
    });
  }
};


exports. updateTradeStatus = async (req, res) => {
  try {
    const { memberId } = req.params;

    // ================= VALIDATION =================
    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "MID required",
      });
    }

    // ================= DB =================
    const pool = await poolPromise;

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "DB connection failed",
      });
    }

    // ================= UPDATE STATUS =================
    const result = await pool
      .request()
      .input("MID", sql.VarChar, memberId)
      .query(`
        UPDATE AI_TradeHistory
        SET Status = 'Success'
        WHERE MemberID = @MID
          AND Status = 'Pending'
          AND TradeDate <= DATEADD(HOUR, -1, GETDATE())
      `);

    return res.json({
      success: true,
      message: "Trade status updated successfully",
      updatedRows: result.rowsAffected[0],
    });

  } catch (err) {
    console.log("UPDATE STATUS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
};