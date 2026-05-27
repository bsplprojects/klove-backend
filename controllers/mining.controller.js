import sql from "mssql";
import crypto from "crypto";
import { poolPromise } from "../config/db.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/* ===============================
   HASH GENERATOR
================================ */

const generateHashID = () => {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `MIN-${Date.now().toString().slice(-6)}-${random}`;
};

export const startMining = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { MID, tradeWallet } = req.body;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    await transaction.begin();

    // ===============================
    // CHECK LAST MINING (24 HOURS)
    // ===============================

    const check = await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT TOP 1 pDate
        FROM Growth_Income
        WHERE MID=@MID
        ORDER BY pDate DESC
      `);

    if (check.recordset.length > 0) {
      const lastDate = new Date(check.recordset[0].pDate);

      const diff =
        (Date.now() - lastDate.getTime()) /
        (1000 * 60 * 60);

      if (diff < 24) {

        await transaction.rollback();

        return res.status(400).json({
          success: false,
          message: `You can start mining after ${(
            24 - diff
          ).toFixed(2)} hours`,
        });
      }
    }

    // ===============================
    // GET USER
    // ===============================

    const user = await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT Name
        FROM Member_Details
        WHERE ConsumerID=@MID
      `);

    if (!user.recordset.length) {

      await transaction.rollback();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const name = user.recordset[0].Name;

    // ===============================
    // GET WALLET
    // ===============================

    const dashboard = await new sql.Request(transaction)
      .input("userID", sql.VarChar, MID)
      .execute("Get_MyFundWallet");

    if (!dashboard.recordset?.length) {

      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Dashboard data not found",
      });
    }

    const topupWallet =
      Number(dashboard.recordset[0].Balance || 0);

    const totalInvestment =
      Number(tradeWallet || 0);

    if (totalInvestment <= 0) {

      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "No active investment found",
      });
    }

    // ===============================
    // CALCULATIONS
    // ===============================

    const amount = totalInvestment * 0.002;
    const serviceCharge = amount * 0.05;
    const tds = amount * 0.05;
    const netAmount = amount - serviceCharge - tds;

    const hashID = generateHashID(MID);

    // ===============================
    // INSERT
    // ===============================

    await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .input("Name", sql.VarChar, name)
      .input("HashID", sql.VarChar, hashID)
      .input("Amount", sql.Decimal(18, 2), amount)
      .input(
        "ServiceCharge",
        sql.Decimal(18, 2),
        serviceCharge
      )
      .input("TDS", sql.Decimal(18, 2), tds)
      .input("NetAmount", sql.Decimal(18, 2), netAmount)
      .input("USDTAmount", sql.Decimal(18, 2), topupWallet)
      .input("PolAmount", sql.Decimal(18, 2), totalInvestment)
      .query(`
        INSERT INTO Growth_Income
        (
          MID,Name,HashID,pDate,Day,
          Amount,ServiceCharge,TDS,
          NetAmount,Status,USDT,Pol
        )
        VALUES
        (
          @MID,
          @Name,
          @HashID,
          GETDATE(),
          DATENAME(WEEKDAY,GETDATE()),
          @Amount,
          @ServiceCharge,
          @TDS,
          @NetAmount,
          'Paid',
          @USDTAmount,
          @PolAmount
        )
      `);

    await transaction.commit();

    return res.json({
      success: true,
      message: "Mining started & income credited",
      hashID,
      totalInvestment,
      miningAmount: amount,
      lastMiningTime: new Date(),
    });

  } catch (error) {

    // IMPORTANT FIX
    if (transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (e) {}
    }

    console.log("Mining Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// ================= MINING STATUS =================
export const getMiningStatus = async (req, res) => {
  try {
    const { MID } = req.params;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT TOP 1 pDate
        FROM Growth_Income
        WHERE MID = @MID
        ORDER BY pDate DESC
      `);

    const serverTime = Date.now();

    // No mining record
    if (result.recordset.length === 0) {
      return res.json({
        success: true,
        lastMiningTime: null,
        serverTime,
      });
    }
const rawDate = result.recordset[0].pDate;

const formatted = dayjs(
  rawDate.toISOString().replace("Z", "")
).format("DD MMM YYYY, hh:mm A");



    return res.json({
      success: true,
      lastMiningTime: formatted,
      serverTime,
    });

  } catch (error) {
    console.log("Mining Status Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// ================= MINING HISTORY =================
dayjs.extend(utc);
dayjs.extend(timezone);

export const getMiningHistory = async (req, res) => {
  try {
    const { MID } = req.params;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT
          ID,
          MID,
          Name,
          pDate,
          Day,
          Amount,
          ServiceCharge,
          TDS,
          NetAmount,
          Status,
          HashID
        FROM Growth_Income
        WHERE MID = @MID
        ORDER BY ID DESC
      `);

    
    /* ✅ DATE CONVERT HERE */
    const data = result.recordset.map((row) => ({
      ...row,
      pDateFormatted: dayjs(
  row.pDate.toISOString().replace("Z", "")
).format("DD MMM YYYY, hh:mm A"),
    
    }));

    return res.json({
      success: true,
      total: data.length,
      data,
    });

  } catch (error) {
    console.log("Mining History Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



