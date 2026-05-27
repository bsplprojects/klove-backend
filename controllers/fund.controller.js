import sql from "mssql";
import crypto from "crypto";
import { poolPromise } from "../config/db.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import levelPayout from "../services/levelPayout.js";
import { updateMyRank } from "../services/updateMyRank.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const addFundDeposit = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const {
      userAddress,
      asset,
      amount,
      txHash,
      status,
      MID,
      Name,
      pType,
    } = req.body;

    if (!userAddress || !amount || !txHash || !MID) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // ================= DUPLICATE CHECK =================

    const duplicateCheck = await new sql.Request(transaction)
      .input("TxHash", sql.VarChar, txHash)
      .query(`
        SELECT TOP 1 id
        FROM TopUp
        WHERE TxHash = @TxHash
      `);

    if (duplicateCheck.recordset.length > 0) {

      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Transaction already exists",
      });
    }

    // ================= UPDATE MEMBER =================

    await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .input("Amount", sql.Decimal(18, 2), amount)
      .query(`
        UPDATE Member_Details
        SET 
          mStatus = 'Active',
          Joining_Comp_Level = GETDATE(),
          Price = ISNULL(Price,0) + @Amount
        WHERE ConsumerID = @MID
      `);

    // ================= INSERT TOPUP =================

    await new sql.Request(transaction)
      .input("MID", sql.VarChar, MID)
      .input("Name", sql.VarChar, Name || "")
      .input("amount", sql.Decimal(18, 2), amount)
      .input("tdate", sql.DateTime, new Date())
      .input("pDate", sql.DateTime, new Date())
      .input("pType", sql.VarChar, pType || "Deposit")
      .input("Coin", sql.Int, 1)
      .input("Status", sql.VarChar, status || "Credited")
      .input("UserAddress", sql.VarChar, userAddress)
      .input("TxHash", sql.VarChar, txHash)
      .query(`
        INSERT INTO TopUp
        (
          MID,
          Name,
          amount,
          tdate,
          pDate,
          pType,
          Coin,
          Status,
          UserAddress,
          TxHash
        )
        VALUES
        (
          @MID,
          @Name,
          @amount,
          @tdate,
          @pDate,
          @pType,
          @Coin,
          @Status,
          @UserAddress,
          @TxHash
        )
      `);

    // ================= COMMIT =================

    await transaction.commit();

    // ================= UPDATE RANK =================

    await updateMyRank(MID);

    // ================= CHECK MEMBER_DETAILS RANK =================

    const memberRank = await new sql.Request(pool)
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT Product_Name, SponsorId
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    const achievedRank =
      memberRank.recordset[0]?.Product_Name || "";

    // ================= DIRECT CHECK =================

    if (achievedRank !== "") {

      const SID = memberRank.recordset[0]?.SponsorId;

      // ================= SPONSOR WALLET =================

      const walletResult = await new sql.Request(pool)
        .input("userId", sql.VarChar, SID)
        .execute("Get_MemberDashboard");

      if (walletResult.recordset.length > 0) {

        let wallet = Number(
          walletResult.recordset[0].TotalIncome || 0
        );

        // ================= PERCENTAGE =================

        let percent = 0;

        if (achievedRank === "DIRECT") {
          percent = 3;
        }
        else if (achievedRank === "OX1") {
          percent = 2;
        }
        else if (achievedRank === "OX2") {
          percent = 1;
        }

        // ================= INCOME =================

        const income = (wallet * percent) / 100;

        // ================= SPONSOR NAME =================

        const sponsorData = await new sql.Request(pool)
          .input("MID", sql.VarChar, SID)
          .query(`
            SELECT Name
            FROM Member_Details
            WHERE ConsumerID = @MID
          `);

        const sponsorName =
          sponsorData.recordset[0]?.Name || "";

        // ================= INSERT INCOME =================

        if (income > 0) {

          await new sql.Request(pool)
            .input("MID", sql.VarChar, MID)
            .input("Name", sql.VarChar, sponsorName)
            .input("LevelId", sql.VarChar, SID)
            .input("Amount", sql.Decimal(18, 2), income)
            .query(`
              INSERT INTO SingleLegIncome
              (
                MID,
                Name,
                pDate,
                LevelId,
                Team,
                Direct,
                Amount,
                Status
              )
              VALUES
              (
                @MID,
                @Name,
                GETDATE(),
                @LevelId,
                1,
                1,
                @Amount,
                'Credited'
              )
            `);

          console.log(
            `${SID} got ${income} single leg income`
          );
        }
      }
    }

    return res.json({
      success: true,
      message: "TopUp deposit saved successfully",
    });

  } catch (err) {

    console.error("TopUp insert error:", err);

    try {

      if (transaction._aborted !== true) {
        await transaction.rollback();
      }

    } catch (rollbackErr) {

      console.log("Rollback error:", rollbackErr);
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getDepositReportByMID = async (req, res) => {
  try {
   const { MID } = req.params;

    if (!MID) {
      return res.status(400).json({
        success: false,
        message: "MID is required",
      });
    }

    const pool = await poolPromise;

    // ================= MAIN DATA =================
    const data = await pool.request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT 
          ID,
          MID,
          Name,
          rDate,
          Amount,
          tNo,
          ImageUrl,
          Status,
          Method,
          Remark,
          Type,
          Refrence,
          Bank
        FROM dbo.AddFundRequest
        WHERE MID = @MID
        ORDER BY ID DESC
      `);

    // ================= SUMMARY =================
    const summary = await pool.request()
      .input("MID", sql.VarChar, MID)
      .query(`
        SELECT 
          COUNT(*) AS totalRequests,
          SUM(CAST(Amount AS DECIMAL(18,2))) AS totalAmount,
          SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pendingCount,
          SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS approvedCount,
          SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedCount
        FROM dbo.AddFundRequest
        WHERE MID = @MID
      `);

    return res.json({
      success: true,
      data: data.recordset,
      summary: summary.recordset[0],
    });

  } catch (error) {
    console.log("Report API Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* ================= ADD FUND DEPOSIT ================= */

export const repFundDeposit = async (req, res) => {
  try {
    const {
      MID,
      Name,
      Amount,
      tNo,
      Method,
      Remark,
      Type,
      Refrence,
      Bank,
    } = req.body;

    if (!MID || !Amount || !tNo) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : "";

    // ================= DB CONNECTION =================
    const pool = await poolPromise;

    await pool.request()
      .input("MID", sql.VarChar, MID)
      .input("Name", sql.VarChar, Name || "")
      .input("Amount", sql.Decimal(18,2), Amount)
      .input("tNo", sql.VarChar, tNo)
      .input("ImageUrl", sql.VarChar, imageUrl)
      .input("Method", sql.VarChar, Method || "")
      .input("Remark", sql.VarChar, Remark || "")
      .input("Type", sql.VarChar, Type || "")
      .input("Refrence", sql.VarChar, Refrence || "")
      .input("Bank", sql.VarChar, Bank || "")
      .query(`
        INSERT INTO AddFundRequest
        (
          MID,
          Name,
          rDate,
          Amount,
          tNo,
          ImageUrl,
          Status,
          Method,
          Remark,
          Type,
          Refrence,
          Bank
        )
        VALUES
        (
          @MID,
          @Name,
          GETDATE(),
          @Amount,
          @tNo,
          @ImageUrl,
          'Pending',
          @Method,
          @Remark,
          @Type,
          @Refrence,
          @Bank
        )
      `);

    return res.json({
      success: true,
      message: "Deposit request submitted successfully",
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* ================= GET ALL DEPOSITS ================= */

export const getAllDeposits = async (req, res) => {
  try {
    const result = await sql.query`
      SELECT TOP (100000)
        ID,
        MID,
        Name,
        rDate,
        Amount,
        tNo,
        ImageUrl,
        Status,
        Method,
        Remark,
        Type,
        Refrence,
        Bank
      FROM AddFundRequest
      ORDER BY ID DESC
    `;

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* ================= UPDATE STATUS ================= */

export const updateDepositStatus = async (req, res) => {
  try {
    const { id, status } = req.body;

    await sql.query`
      UPDATE AddFundRequest
      SET Status = ${status}
      WHERE ID = ${id}
    `;

    return res.status(200).json({
      success: true,
      message: "Deposit status updated",
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};