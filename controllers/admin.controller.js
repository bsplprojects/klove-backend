const { sql, poolPromise } = require("../config/db");

const levelPayout  = require("../services/levelPayout.js");
// ==========================
// MEMBER REPORT (SAFE)
// ==========================
exports.memberReport = async (req, res) => {
  try {
    const pool = await poolPromise;

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    let whereClause = "";

    if (search) {
      whereClause = `
        WHERE
          ConsumerID LIKE @search OR
          Address LIKE @search OR
          SponsorID LIKE @search
      `;
    }

    // 👇 single request from getPool
    const request = pool.request()
      .input("search", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit);

    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM Member_Details
      ${whereClause}
    `);

    const total = countResult.recordset[0].total;

    const dataResult = await request.query(`
      SELECT
        Id,
        ConsumerID AS MemberID,
        Address AS Name,
        SponsorID,
        JoiningDate,
        CASE WHEN ISNULL(Price,0) > 0 THEN 'Active' ELSE 'Inactive' END AS Status,
        ISNULL(Price,0) AS Price,
        0 AS TotalIncome
      FROM Member_Details
      ${whereClause}
      ORDER BY JoiningDate DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      total,
      currentPage: page,
      members: dataResult.recordset,
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
// ==========================
// SEND FUND (SECURE FIXED)
// ==========================
// exports.sendfund = async (req, res) => {

//   const { senderId, receiverId, amount } = req.body;

//   const pool = await poolPromise;
//   const transaction = new sql.Transaction(pool);

//   let started = false;

//   try {
//     if (!senderId || !receiverId || !amount) {
//       throw new Error("Required fields missing");
//     }

//     const amt = Number(amount);

//     if (amt <= 0) throw new Error("Invalid amount");
//     if (senderId === receiverId) throw new Error("Cannot transfer to self");

//     await transaction.begin();
//     started = true;

//     // ================= SENDER =================
//     const sender = await new sql.Request(transaction)
//       .input("MID", sql.VarChar, senderId)
//       .query(`SELECT Name FROM Member_Details WHERE ConsumerID=@MID`);

//     if (!sender.recordset.length) throw new Error("Sender not found");

//     // ================= RECEIVER =================
//     const receiver = await new sql.Request(transaction)
//       .input("MID", sql.VarChar, receiverId)
//       .query(`SELECT Name FROM Member_Details WHERE ConsumerID=@MID`);

//     if (!receiver.recordset.length) throw new Error("Receiver not found");

//     const senderName = sender.recordset[0].Name;
//     const receiverName = receiver.recordset[0].Name;

//     // ================= WALLET CHECK =================
//     if (senderId.toLowerCase() !== "admin") {
//       const wallet = await new sql.Request(transaction)
//         .input("userID", sql.VarChar, senderId)
//         .execute("Get_MyFundWallet");

//       const balance = wallet.recordset[0]?.Balance || 0;

//       if (balance < amt) throw new Error("Insufficient Wallet Balance");
//     }



//     // ================= TRANSACTION ID =================
//     const transID = `TXN${Date.now()}`;

//     // ================= DEBIT (SENDER) =================
//     await new sql.Request(transaction)
//       .input("MID", sql.VarChar, senderId)
//       .input("Name", sql.VarChar, senderName)
//       .input("Amount", sql.Decimal(18,2), amt)
//       .input("receiverId", sql.VarChar, receiverId)
//       .input("transID", sql.VarChar, transID)
//       .query(`
//         INSERT INTO ledger
// (MID, Name, pDate, Amount, type, Remarks, tType, transID,TRX)
// VALUES
// (@MID, @Name, GETDATE(), @Amount, 'Dr.',
// 'Fund Sent To ' + @receiverId,
// 'Fund Transfer', @transID,@receiverId)
//       `);

//     // ================= CREDIT (RECEIVER) =================
//     await new sql.Request(transaction)
//       .input("MID", sql.VarChar, receiverId)
//       .input("Name", sql.VarChar, receiverName)
//       .input("Amount", sql.Decimal(18,2), amt)
//       .input("senderId", sql.VarChar, senderId)
//       .input("transID", sql.VarChar, transID)
      
//       .query(`
//         INSERT INTO ledger
// (MID, Name, pDate, Amount, type, Remarks, tType, transID,TRX)
// VALUES
// (@MID, @Name, GETDATE(), @Amount, 'Cr.',
// 'Fund Received From ' + @senderId,
// 'Fund Transfer', @transID,@senderId)
//       `);

//     await transaction.commit();

//     return res.json({
//       success: true,
//       message: "Fund transferred successfully",
//       transID
//     });

//   } catch (err) {

//     if (started) {
//       try {
//         await transaction.rollback();
//       } catch (e) {
//         console.log("Rollback error:", e.message);
//       }
//     }

//     return res.json({
//       success: false,
//       message: err.message
//     });
//   }
// };

exports.sendfund = async (req, res) => {
  const { senderId, receiverId, amount } = req.body;

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  let started = false;

  try {
    if (!senderId || !receiverId || !amount) {
      throw new Error("Required fields missing");
    }

    const amt = Number(amount);

    if (amt <= 0) throw new Error("Invalid amount");

    if (senderId === receiverId) {
      throw new Error("Cannot transfer to self");
    }

    await transaction.begin();
    started = true;

    // ================= SENDER =================

    const sender = await new sql.Request(transaction)
      .input("MID", sql.VarChar, senderId)
      .query(`
        SELECT Name 
        FROM Member_Details 
        WHERE ConsumerID=@MID
      `);

    if (!sender.recordset.length) {
      throw new Error("Sender not found");
    }

    // ================= RECEIVER =================

    const receiver = await new sql.Request(transaction)
      .input("MID", sql.VarChar, receiverId)
      .query(`
        SELECT Name 
        FROM Member_Details 
        WHERE ConsumerID=@MID
      `);

    if (!receiver.recordset.length) {
      throw new Error("Receiver not found");
    }

    const senderName = sender.recordset[0].Name;
    const receiverName = receiver.recordset[0].Name;

    // ================= BALANCE CHECK =================

    if (senderId.toLowerCase() !== "admin") {
      const wallet = await new sql.Request(transaction)
        .input("userID", sql.VarChar, senderId)
        .execute("Get_MyFundWallet");

      const balance = wallet.recordset[0]?.Balance || 0;

      if (balance < amt) {
        throw new Error("Insufficient Wallet Balance");
      }
    }

      // ================= UPDATE MEMBER =================

    await new sql.Request(transaction)
      .input("MID", sql.VarChar, receiverId)
      .input("Amount", sql.Decimal(18, 2), amount)
      .query(`
        UPDATE Member_Details
        SET 
          mStatus = 'Active',
          Joining_Comp_Level = GETDATE(),
          Price = ISNULL(Price,0) + @Amount
        WHERE ConsumerID = @MID
      `);

    // ================= TRANSACTION ID =================

    const txHash = `TXN${Date.now()}`;

    // =========================================================
    // ================= CREDIT ENTRY (RECEIVER) ===============
    // =========================================================

    await new sql.Request(transaction)
      .input("MID", sql.VarChar, receiverId)
      .input("Name", sql.VarChar, receiverName)
      .input("amount", sql.Decimal(18, 2), amt)
      .input("tdate", sql.DateTime, new Date())
      .input("pDate", sql.DateTime, new Date())
      .input("pType", sql.VarChar, `Fund Received From ${senderId}`)
      .input("Coin", sql.Decimal(18, 2), 1)
      .input("Status", sql.VarChar, "Credited")
      .input("UserAddress", sql.VarChar, senderId)
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

       // ================= LEVEL INCOME =================

    await levelPayout(receiverId, amount, transaction);

    await transaction.commit();

    return res.json({
      success: true,
      message: "Fund transferred successfully",
      txHash,
    });
  } catch (err) {
    if (started) {
      try {
        await transaction.rollback();
      } catch (e) {
        console.log("Rollback error:", e.message);
      }
    }

    return res.json({
      success: false,
      message: err.message,
    });
  }
};


// ==========================
// ACTIVATE MEMBER API
// ==========================
exports.activateAccount = async (req, res) => {
  const { memberId, amount } = req.body;

  let transaction;
  let started = false;

  try {
    // ================= VALIDATION =================
    if (!memberId || !amount) {
      throw new Error("Member ID and amount are required");
    }

    const amt = Number(amount);
    if (amt <= 0) throw new Error("Invalid amount");

    // ================= GET POOL =================
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);

    await transaction.begin();
    started = true;

    // ================= MEMBER CHECK =================
    const memberResult = await new sql.Request(transaction)
      .input("MID", sql.VarChar, memberId)
      .query(`
        SELECT ConsumerID, Name, mStatus
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    const member = memberResult.recordset[0];

    if (!member) throw new Error("Member not found");
    if (member.mStatus === "Active") throw new Error("Member already activated");

    // ================= LEDGER =================
    await new sql.Request(transaction)
      .input("MID", sql.VarChar, memberId)
      .input("Name", sql.VarChar, member.Name)
      .input("Amount", sql.Decimal(18, 2), amt)
      .input("TRX", sql.VarChar, "ADMIN")
      .query(`
        INSERT INTO ledger
        (MID, Name, pDate, Amount, type, Remarks, tType, TRX)
        VALUES
        (@MID, @Name, GETDATE(), @Amount, 'Dr.',
        'Account Activation', 'Activation', @TRX)
      `);

    // ================= UPDATE MEMBER =================
    await new sql.Request(transaction)
      .input("MID", sql.VarChar, memberId)
      .input("Amount", sql.Decimal(18, 2), amt)
      .query(`
        UPDATE Member_Details
        SET 
          mStatus = 'Active',
          Joining_Comp_Level = GETDATE(),
          Price = ISNULL(Price,0) + @Amount
        WHERE ConsumerID = @MID
      `);

    // ================= TOPUP =================
    await new sql.Request(transaction)
      .input("MID", sql.VarChar, memberId)
      .input("Name", sql.VarChar, member.Name)
      .input("Amount", sql.Decimal(18, 2), amt)
      .query(`
        INSERT INTO topup
        (MID, Name, amount, Coin, pDate, pType)
        VALUES
        (@MID, @Name, @Amount, 0, GETDATE(), 'Admin')
      `);

    await transaction.commit();

    return res.json({
      success: true,
      message: "Member activated successfully",
    });

  } catch (err) {
    if (started && transaction) {
      try {
        await transaction.rollback();
      } catch (e) {
        console.log("Rollback error:", e.message);
      }
    }

    return res.json({
      success: false,
      message: err.message,
    });
  }
};


exports.topupReport = async (req, res) => {
  try {
    const pool = await poolPromise;

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const offset = (page - 1) * limit;

    let whereClause = "";

    if (search) {
      whereClause = `
        WHERE
          MID LIKE @search OR
          Name LIKE @search OR
          UserAddress LIKE @search OR
          TxHash LIKE @search OR
          Coin LIKE @search
      `;
    }

    // =========================
    // REQUEST
    // =========================
    const request = pool.request()
      .input("search", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit);

    // =========================
    // TOTAL COUNT
    // =========================
    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM TopUp
      ${whereClause}
    `);

    const total = countResult.recordset[0].total;

    // =========================
    // DATA
    // =========================
    const dataResult = await request.query(`
      SELECT
        id,
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
      FROM TopUp
      ${whereClause}
      ORDER BY id DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      topups: dataResult.recordset,
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.withdrawReport = async (req, res) => {
  try {
    const pool = await poolPromise;

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const offset = (page - 1) * limit;

    let whereClause = "";

    if (search) {
      whereClause = `
        WHERE
          MID LIKE @search OR
          Name LIKE @search OR
          ExchAddress LIKE @search OR
          Coin LIKE @search OR
          HashID LIKE @search OR
          TranID LIKE @search
      `;
    }

    // =========================
    // REQUEST
    // =========================
    const request = pool
      .request()
      .input("search", `%${search}%`)
      .input("offset", offset)
      .input("limit", limit);

    // =========================
    // TOTAL COUNT
    // =========================
    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM SendToTrustWallet
      ${whereClause}
    `);

    const total = countResult.recordset[0].total;

    // =========================
    // DATA
    // =========================
    const dataResult = await request.query(`
      SELECT
        TrustWalletID,
        MID,
        Name,
        ExchAddress,
        Coin,
        AdminCharge,
        Tax,
        Payable,
        Status,
        Remark,
        Flag,
        ModifyDate,
        HashID,
        SendDate,
        Profit,
        Ano,
        TranID
      FROM SendToTrustWallet
      ${whereClause}
      ORDER BY TrustWalletID DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      withdrawals: dataResult.recordset,
    });

  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};