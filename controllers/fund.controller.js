const sql = require("mssql");
const crypto = require("crypto");
const { poolPromise } = require("../config/db");
const dayjs = require("dayjs");

const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const levelPayout = require("../services/levelPayout");
const { updateMyRank } = require("../services/updateMyRank");

dayjs.extend(utc);
dayjs.extend(timezone);

const addFundDeposit = async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const { userAddress, asset, amount, txHash, status, MID, Name, pType } =
      req.body;

    if (!userAddress || !amount || !txHash || !MID) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // ================= DUPLICATE CHECK =================

    const duplicateCheck = await new sql.Request(transaction).input(
      "TxHash",
      sql.VarChar,
      txHash,
    ).query(`
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
      .input("Amount", sql.Decimal(18, 2), amount).query(`
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
      .input("TxHash", sql.VarChar, txHash).query(`
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

    const memberRank = await new sql.Request(pool).input(
      "MID",
      sql.VarChar,
      MID,
    ).query(`
        SELECT Product_Name, SponsorId
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    const achievedRank = memberRank.recordset[0]?.Product_Name || "";

    // ================= DIRECT CHECK =================

    if (achievedRank !== "") {
      const SID = memberRank.recordset[0]?.SponsorId;

      // ================= SPONSOR WALLET =================

      const walletResult = await new sql.Request(pool)
        .input("userId", sql.VarChar, SID)
        .execute("Get_MemberDashboard");

      if (walletResult.recordset.length > 0) {
        let wallet = Number(walletResult.recordset[0].TotalIncome || 0);

        // ================= PERCENTAGE =================

        let percent = 0;

        if (achievedRank === "DIRECT") {
          percent = 3;
        } else if (achievedRank === "OX1") {
          percent = 2;
        } else if (achievedRank === "OX2") {
          percent = 1;
        }

        // ================= INCOME =================

        const income = (wallet * percent) / 100;

        // ================= SPONSOR NAME =================

        const sponsorData = await new sql.Request(pool).input(
          "MID",
          sql.VarChar,
          SID,
        ).query(`
            SELECT Name
            FROM Member_Details
            WHERE ConsumerID = @MID
          `);

        const sponsorName = sponsorData.recordset[0]?.Name || "";

        // ================= INSERT INCOME =================

        if (income > 0) {
          await new sql.Request(pool)
            .input("MID", sql.VarChar, MID)
            .input("Name", sql.VarChar, sponsorName)
            .input("LevelId", sql.VarChar, SID)
            .input("Amount", sql.Decimal(18, 2), income).query(`
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

          console.log(`${SID} got ${income} single leg income`);
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

const getDepositReportByMID = async (req, res) => {
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
    const data = await pool.request().input("MID", sql.VarChar, MID).query(`
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
        WHERE (@MID = 'Admin' OR MID = @MID)
        ORDER BY ID DESC
      `);

    // ================= SUMMARY =================
    const summary = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT 
          COUNT(*) AS totalRequests,
          SUM(CAST(Amount AS DECIMAL(18,2))) AS totalAmount,
          SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pendingCount,
          SUM(CASE WHEN Status = 'Approved' THEN 1 ELSE 0 END) AS approvedCount,
          SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS rejectedCount
        FROM dbo.AddFundRequest
        WHERE (@MID = 'Admin' OR MID = @MID)
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

const repFundDeposit = async (req, res) => {
  try {
    let { MID, Amount, tNo, Method, Remark, Type, Refrence, Bank } = req.body;

    if (typeof MID === "object" && MID !== null) {
      MID = MID.MID;
    }

    if (typeof MID === "string" && MID.startsWith("{")) {
      try {
        const parsed = JSON.parse(MID);
        MID = parsed.MID;
      } catch (err) {}
    }

    if (!MID || !Amount || !tNo) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

    const pool = await poolPromise;

    // ================= GET MEMBER NAME =================
    const memberResult = await pool.request().input("MID", sql.VarChar(50), MID)
      .query(`
        SELECT TOP 1 Name
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (memberResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const Name = memberResult.recordset[0].Name;

    // ================= INSERT REQUEST =================
    await pool
      .request()
      .input("MID", sql.VarChar(50), MID)
      .input("Name", sql.VarChar(100), Name)
      .input("Amount", sql.Decimal(18, 2), Amount)
      .input("tNo", sql.VarChar(100), tNo)
      .input("ImageUrl", sql.VarChar(500), imageUrl)
      .input("Method", sql.VarChar(100), Method || "")
      .input("Remark", sql.VarChar(500), Remark || "")
      .input("Type", sql.VarChar(100), Type || "")
      .input("Refrence", sql.VarChar(100), Refrence || "")
      .input("Bank", sql.VarChar(100), Bank || "").query(`
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

const getAllDeposits = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
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
    `);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log("getAllDeposits error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/* ================= UPDATE STATUS ================= */

const updateDepositStatus = async (req, res) => {
  try {
    const { id, status } = req.body;

    const pool = await poolPromise;

    // ================= GET REQUEST =================
    const depositResult = await pool.request().input("id", sql.Int, id).query(`
        SELECT *
        FROM AddFundRequest
        WHERE ID = @id
      `);

    const deposit = depositResult.recordset[0];

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit request not found",
      });
    }

    // ================= UPDATE STATUS =================
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("status", sql.VarChar, status).query(`
        UPDATE AddFundRequest
        SET Status = @status
        WHERE ID = @id
      `);

    // ================= LEDGER ENTRY =================
    if (status === "Approved" && deposit.Status !== "Approved") {
      console.log("Deposit:", deposit);

      // Get Member Details
      const memberResult = await pool
        .request()
        .input("MID", sql.VarChar, deposit.MID).query(`
          SELECT TOP 1 *
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      const member = memberResult.recordset[0];

      if (member) {
        await pool
          .request()
          .input("MID", sql.VarChar, deposit.MID)
          .input("Name", sql.VarChar, member.Name || "")
          .input("Amount", sql.Decimal(18, 2), deposit.Amount)
          .input("transID", sql.VarChar, `DEP-${id}`).query(`
            INSERT INTO ledger
            (
              MID,
              Name,
              pDate,
              qty,
              Amount,
              type,
              Remarks,
              tType,
              transID
            )
            VALUES
            (
              @MID,
              @Name,
              GETDATE(),
              1,
              @Amount,
              'Fund Deposit',
              'Fund Added By Admin',
              'Cr.',
              @transID
            )
          `);

        console.log("Ledger Inserted Successfully");
      } else {
        console.log("Member not found for MID:", deposit.MID);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Deposit status updated",
    });
  } catch (error) {
    console.log("Update Deposit Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

const memberReport = async (req, res) => {
  try {
    const pool = await poolPromise;

    const search = req.query.search || "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const hasSearch = search.trim().length > 0;

    const whereClause = hasSearch
      ? `WHERE 
          ConsumerID LIKE @search 
          OR Address LIKE @search 
          OR SponsorId LIKE @search`
      : "";

    // ✅ NEW REQUEST FOR COUNT
    const countRequest = pool.request();
    if (hasSearch) countRequest.input("search", `%${search}%`);

    const totalResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM Member_Details
      ${whereClause}
    `);

    // ✅ NEW REQUEST FOR DATA
    const dataRequest = pool
      .request()
      .input("offset", offset)
      .input("limit", limit);

    if (hasSearch) dataRequest.input("search", `%${search}%`);

    const dataResult = await dataRequest.query(`
      SELECT
        ID,
        ConsumerID AS MemberID,
        Name,
        MobileNo,
        PhoneNo,
        Address AS Address,
        SponsorId,
        JoiningDate,
        CASE 
          WHEN ISNULL(Price,0) > 0 THEN 'Active' 
          ELSE 'Inactive' 
        END AS Status,
        ISNULL(Price,0) AS Price,
        0 AS TotalIncome
      FROM Member_Details
      ${whereClause}
      ORDER BY JoiningDate DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    return res.json({
      success: true,
      total: totalResult.recordset[0].total,
      currentPage: page,
      limit,
      members: dataResult.recordset,
    });
  } catch (err) {
    console.log("MEMBER REPORT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const sendFund = async (req, res) => {
  try {
    const { MID, Amount, Remark } = req.body;

    if (!MID || !Amount) {
      return res.status(400).json({
        success: false,
        message: "Member ID and Amount are required",
      });
    }

    const pool = await poolPromise;

    // Member Check
    const member = await pool.request().input("MID", sql.VarChar(50), MID)
      .query(`
        SELECT TOP 1 *
        FROM Member_Details
        WHERE ConsumerID=@MID
      `);

    if (member.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const memberData = member.recordset[0];

    // Random Transaction No
    const transactionNo = "SF" + Date.now() + Math.floor(Math.random() * 9999);

    // Random Hash
    const hashId = crypto.randomBytes(8).toString("hex").toUpperCase();

    await pool
      .request()
      .input("MID", sql.VarChar(50), MID)
      .input("Name", sql.VarChar(100), memberData.Name || "")
      .input("Amount", sql.Decimal(18, 2), Amount)
      .input("tNo", sql.VarChar(100), transactionNo)
      .input("Remark", sql.VarChar(500), Remark || "")
      .input("HashId", sql.VarChar(100), hashId).query(`
        INSERT INTO AddFundRequest
        (
          MID,
          Name,
          rDate,
          Amount,
          tNo,
          Status,
          Method,
          Remark,
          Type,
          Refrence
        )
        VALUES
        (
          @MID,
          @Name,
          GETDATE(),
          @Amount,
          @tNo,
          'Approved',
          'Admin Transfer',
          @Remark,
          'SendFund',
          @HashId
        )
      `);

    // ================= LEDGER ENTRY =================
    await pool
      .request()
      .input("MID", sql.VarChar(50), MID)
      .input("Name", sql.VarChar(100), memberData.Name || "")
      .input("Amount", sql.Decimal(18, 2), Amount)
      .input("TxnNo", sql.VarChar(100), transactionNo).query(`
    INSERT INTO ledger
    (
      MID,
      Name,
      pDate,
      qty,
      Amount,
      type,
      Remarks,
      tType,
      transID
    )
    VALUES
    (
      @MID,
      @Name,
      GETDATE(),
      1,
      @Amount,
      'Fund Deposit',
      'Fund Added By Admin',
      'Cr.',
      @TxnNo
    )
  `);

    return res.status(200).json({
      success: true,
      message: "Fund sent successfully",
      transactionNo,
      hashId,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const getSendFundHistory = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
        Id,
        MID,
        Name,
        Amount,
        tNo,
        Status,
        Method,
        Remark,
        Type,
        Refrence,
        rDate AS CreatedAt
      FROM AddFundRequest
      WHERE Type = 'SendFund'
      ORDER BY Id DESC
    `);

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

const sendFundByMember = async (req, res) => {
  const { MID, MIDTo, Amount } = req.body;

  try {
    // ================= VALIDATION =================
    if (!MID || !MIDTo || !Amount || isNaN(Number(Amount))) {
      return res.json({
        status: "INVALID",
        message: "Invalid request",
      });
    }

    const amount = Number(Amount);

    if (amount < 10) {
      return res.json({
        status: "INVALID",
        message: "Minimum 10$ Can be Transfer !!!",
      });
    }

    if (amount % 10 !== 0) {
      return res.json({
        status: "INVALID",
        message: "Payments are accepted in multiples of 10 only.",
      });
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // ================= SENDER CHECK =================
      const senderResult = await transaction
        .request()
        .input("MID", sql.VarChar, MID).query(`
          SELECT *
          FROM Member_Details
          WHERE ConsumerID = @MID
        `);

      const sender = senderResult.recordset[0];

      if (!sender || sender.mStatus === "Block") {
        await transaction.rollback();

        return res.json({
          status: "INVALID",
          message: "Sender ID Blocked! Contact Support",
        });
      }

      // ================= RECEIVER CHECK =================
      const receiverResult = await transaction
        .request()
        .input("MIDTo", sql.VarChar, MIDTo).query(`
          SELECT *
          FROM Member_Details
          WHERE ConsumerID = @MIDTo
        `);

      const receiver = receiverResult.recordset[0];

      if (!receiver || receiver.mStatus === "Block") {
        await transaction.rollback();

        return res.json({
          status: "INVALID",
          message: "Receiver ID Blocked! Contact Support",
        });
      }

      // ================= WALLET CHECK =================
      const walletResult = await new sql.Request(pool)
        .input("userId", sql.VarChar, MID)
        .execute("Get_MyFundWallet");

      const wallet = walletResult.recordset[0];

      if (!wallet || Number(wallet.Balance) < amount) {
        await transaction.rollback();

        return res.json({
          status: "INVALID",
          message: "Low Fund Wallet",
        });
      }

      // ================= DEBIT LEDGER =================
      await transaction
        .request()
        .input("MID", sql.VarChar, sender.ConsumerID)
        .input("Name", sql.VarChar, sender.Name)
        .input("Amount", sql.Decimal(18, 2), amount)
        .input("Remarks", sql.VarChar, `Fund Sent to ${receiver.ConsumerID}`)
        .query(`
          INSERT INTO ledger
          (
            MID,
            Name,
            pDate,
            qty,
            Amount,
            type,
            Remarks,
            tType,
            transID
          )
          VALUES
          (
            @MID,
            @Name,
            GETDATE(),
            1,
            @Amount,
            'Wallet Sent',
            @Remarks,
            'Dr.',
            'by Transfer'
          )
        `);

      // ================= CREDIT LEDGER =================
      await transaction
        .request()
        .input("MID", sql.VarChar, receiver.ConsumerID)
        .input("Name", sql.VarChar, receiver.Name)
        .input("Amount", sql.Decimal(18, 2), amount)
        .input(
          "Remarks",
          sql.VarChar,
          `Fund Received from ${sender.ConsumerID}`,
        ).query(`
          INSERT INTO ledger
          (
            MID,
            Name,
            pDate,
            qty,
            Amount,
            type,
            Remarks,
            tType,
            transID
          )
          VALUES
          (
            @MID,
            @Name,
            GETDATE(),
            1,
            @Amount,
            'Wallet Received',
            @Remarks,
            'Cr.',
            'by Transfer'
          )
        `);

      await transaction.commit();

      return res.json({
        status: "SUCCESS",
        message: "Fund Transfer Successful",
      });
    } catch (error) {
      await transaction.rollback();

      return res.json({
        status: "FAILURE",
        message: error.message,
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "FAILURE",
      message: error.message,
    });
  }
};

module.exports = {
  addFundDeposit,
  getDepositReportByMID,
  repFundDeposit,
  getAllDeposits,
  updateDepositStatus,
  memberReport,
  sendFund,
  getSendFundHistory,
  sendFundByMember,
};
