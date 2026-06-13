const { ethers } = require("ethers");
const sql = require("mssql");
const { poolPromise } = require("../config/db");

// Polygon USDT Contract
const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

const USDT_ABI = [
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
];

const withdrawalRequest = async (req, res) => {
  let pool;

  try {
    const { MID, amount, currency } = req.body;

    // ================= VALIDATION =================
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount required",
      });
    }

    let mainAmount = Number(amount);

    if (currency === "INR" && mainAmount < 500) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal is 500 INR",
      });
    }

    if (currency === "USDT" && mainAmount < 5) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal is 5 USDT",
      });
    }

    // ================= DB CONNECT =================
    pool = await poolPromise;

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "DB connection failed",
      });
    }

    // ================= MEMBER =================
    const member = await pool.request().input("MID", sql.VarChar, MID).query(`
        SELECT TOP 1 *
        FROM Member_Details
        WHERE ConsumerID = @MID
      `);

    if (member.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    const user = member.recordset[0];

    // check there has to be a uplineid for the member before insertion
    if (user.uplineid === null || user.uplineid === "") {
      return res.status(400).json({
        success: false,
        message: "Please set the UPI ID in your profile",
      });
    }

    if (currency === "USDT") {
      if (user.Product_Name === null || user.Product_Name === "") {
        return res.status(400).json({
          success: false,
          message: "Please set the BEP 20 address in your profile",
        });
      }
    }

    // INSERT THE RECORD INSIDE THE BANK TRANSFER NEW TABLE
    // deduct rupees 10 of the amount

    // if currency is USDT multiply by 100
    if (currency === "USDT") {
      mainAmount = mainAmount * 100;
    }

    let deductedAmount = mainAmount + 10;

    const result = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .input("Amount", sql.Float, deductedAmount)
      .input("Status", sql.VarChar, "pending")
      .input("PDate", sql.DateTime, new Date())
      .input("Mode", sql.VarChar, currency)
      .input("Name", sql.VarChar, user.Name)
      .input("deduction", sql.Decimal, mainAmount)
      .input(
        "PayMobNo",
        sql.VarChar,
        currency === "USDT" ? "1 USDT = 100 INR converted" : "",
      )
      .input(
        "upi",
        sql.VarChar,
        currency === "USDT" ? user.Product_Name : user.uplineid,
      )
      .query(
        `
        INSERT INTO BankTransferNew (MID, Amount, Status, PDate, Mode, Name, BAnk, PayMobNo, deduction) VALUES (@MID, @Amount, @Status, @PDate, @Mode, @Name, @upi, @PayMobNo, @deduction);
      `,
      );

    if (result.rowsAffected[0] === 0) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal request failed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Withdrawal Request successfull",
      data: result.recordset,
    });
  } catch (err) {
    console.log("WITHDRAW ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      err: err.message,
    });
  }
};

// export const withdrawalRequestpol = async (req, res) => {
//   let pool;
//   let transaction;

//   try {
//     const { MID, amount } = req.body;

//     // ================= VALIDATION =================
//     if (!MID || !amount) {
//       return res.status(400).json({
//         success: false,
//         message: "MID and amount required",
//       });
//     }

//     const mainAmount = Number(amount);

//     if (mainAmount < 1) {
//       return res.status(400).json({
//         success: false,
//         message: "Minimum withdrawal is 1 POL",
//       });
//     }

//     // ================= POOL =================
//     pool = await poolPromise;

//     if (!pool) {
//       return res.status(500).json({
//         success: false,
//         message: "DB connection failed",
//       });
//     }

//     // ================= MEMBER =================
//     const member = await pool
//       .request()
//       .input("MID", sql.VarChar, MID)
//       .query(`
//         SELECT TOP 1 *
//         FROM Member_Details
//         WHERE ConsumerID = @MID
//       `);

//     if (member.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Member not found",
//       });
//     }

//     const user = member.recordset[0];
//     const walletAddress = user.Address;

//     if (!walletAddress) {
//       return res.status(400).json({
//         success: false,
//         message: "Wallet address missing",
//       });
//     }

//     // ================= BALANCE CHECK =================
//     const wallet = await pool
//       .request()
//       .input("userID", sql.VarChar, MID)
//       .execute("Get_MyFundWallet");

//     const balance = Number(wallet.recordset[0]?.Balance || 0);

//     if (balance < mainAmount) {
//       return res.status(400).json({
//         success: false,
//         message: "Insufficient balance",
//       });
//     }

//     // ================= CALCULATION =================
//     const tax = (mainAmount * 1) / 100;
//     const payable = mainAmount - tax;

//     // ================= BLOCKCHAIN =================
//     const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
//     const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

//     // ================= TRANSACTION START =================
//     transaction = new sql.Transaction(pool);
//     await transaction.begin();

//     // send POL
//     const tx = await adminWallet.sendTransaction({
//       to: walletAddress,
//       value: ethers.parseEther(payable.toString()),
//     });

//     const receipt = await tx.wait();
//     const txHash = receipt?.hash || tx.hash;

//     // ================= DB SAVE =================
//     await new sql.Request(transaction)
//       .input("MID", sql.VarChar, MID)
//       .input("Name", sql.VarChar, user.Name)
//       .input("HashID", sql.VarChar, txHash)
//       .input("AdminCharge", sql.Decimal(18, 2), mainAmount)
//       .input("Tax", sql.Decimal(18, 2), tax)
//       .input("Payable", sql.Decimal(18, 2), payable)
//       .input("Status", sql.VarChar, "Success")
//       .input("SendDate", sql.DateTime, new Date())
//       .query(`
//         INSERT INTO SendToTrustWallet
//         (
//           MID,
//           Name,
//           HashID,
//           AdminCharge,
//           Tax,
//           Payable,
//           Status,
//           SendDate
//         )
//         VALUES
//         (
//           @MID,
//           @Name,
//           @HashID,
//           @AdminCharge,
//           @Tax,
//           @Payable,
//           @Status,
//           @SendDate
//         )
//       `);

//     await transaction.commit();

//     return res.json({
//       success: true,
//       message: "POL Withdrawal successful",
//       txHash,
//     });

//   } catch (err) {
//     console.log("WITHDRAW ERROR:", err);

//     if (transaction) {
//       try {
//         await transaction.rollback();
//       } catch (e) {
//         console.log("ROLLBACK ERROR:", e);
//       }
//     }

//     return res.status(500).json({
//       success: false,
//       message: err?.message || "Server error",
//     });
//   }
// };
// export const withdrawalRequest = async (req, res) => {
//   const transaction = new sql.Transaction(await poolPromise);

//   try {
//     const { MID, amount } = req.body;

//     // ================= VALIDATION =================

//     if (!MID || !amount) {
//       return res.status(400).json({
//         success: false,
//         message: "MID and amount required",
//       });
//     }

//     const mainAmount = Number(amount);

//     if (mainAmount < 1) {
//       return res.status(400).json({
//         success: false,
//         message: "Minimum withdrawal is 1 USDT",
//       });
//     }

//     const pool = await poolPromise;

//     // ================= MEMBER =================

//     const member = await pool
//       .request()
//       .input("MID", sql.VarChar, MID)
//       .query(`
//         SELECT TOP 1 *
//         FROM Member_Details
//         WHERE ConsumerID = @MID
//       `);

//     if (member.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Member not found",
//       });
//     }

//     const user = member.recordset[0];

//     const walletAddress = user.Address;

//     if (!walletAddress) {
//       return res.status(400).json({
//         success: false,
//         message: "Wallet address missing",
//       });
//     }

//     // ================= CHECK BALANCE =================

//     const wallet = await pool
//       .request()
//       .input("userID", sql.VarChar, MID)
//       .execute("Get_MyFundWallet");

//     const balance = Number(wallet.recordset[0]?.Balance || 0);

//     if (balance < mainAmount) {
//       return res.status(400).json({
//         success: false,
//         message: "Insufficient balance",
//       });
//     }

//     // ================= CALCULATION =================

//     const tax = (mainAmount * 1) / 100;

//     const payable = (mainAmount * 99) / 100;

//     // ================= POLYGON USDT =================

//     const tokenAddress =
//       "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

//     // convert to 6 decimals (USDT Polygon)
//     const amountWei = Math.floor(payable * 1_000_000).toString();

//     // ================= TATUM API =================

//     const payload = {
//       contractAddress: tokenAddress,

//       methodName: "transfer",

//       methodABI: {
//         inputs: [
//           {
//             name: "_to",
//             type: "address",
//           },
//           {
//             name: "_value",
//             type: "uint256",
//           },
//         ],

//         name: "transfer",

//         outputs: [
//           {
//             name: "",
//             type: "bool",
//           },
//         ],

//         stateMutability: "nonpayable",

//         type: "function",
//       },

//       params: [walletAddress, amountWei],

//       fromPrivateKey: process.env.PRIVATE_KEY,
//     };

//     await transaction.begin();

//     // ================= SEND TOKEN =================

//     const response = await axios.post(
//       "https://api.tatum.io/v3/polygon/smartcontract",
//       payload,
//       {
//         headers: {
//           "x-api-key": process.env.TATUM_API_KEY,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     console.log(response.data);

//     const txHash =
//       response.data?.txId ||
//       response.data?.transactionHash ||
//       "";

//     // ================= SAVE =================

//     await new sql.Request(transaction)
//       .input("MID", sql.VarChar, MID)
//       .input("Name", sql.VarChar, user.Name)
//       .input("HashID", sql.VarChar, txHash)
//       .input("AdminCharge", sql.Decimal(18, 2), mainAmount)
//       .input("Tax", sql.Decimal(18, 2), tax)
//       .input("Payable", sql.Decimal(18, 2), payable)
//       .input("Status", sql.VarChar, txHash ? "Success" : "Failed")
//       .input("SendDate", sql.DateTime, new Date())
//       .query(`
//         INSERT INTO SendToTrustWallet
//         (
//           MID,
//           Name,
//           HashID,
//           AdminCharge,
//           Tax,
//           Payable,
//           Status,
//           SendDate
//         )
//         VALUES
//         (
//           @MID,
//           @Name,
//           @HashID,
//           @AdminCharge,
//           @Tax,
//           @Payable,
//           @Status,
//           @SendDate
//         )
//       `);

//     await transaction.commit();

//     return res.json({
//       success: true,
//       message: "Withdrawal successful",
//       txHash,
//     });
//   } catch (err) {
//     console.log(err?.response?.data || err);

//     try {
//       await transaction.rollback();
//     } catch {}

//     return res.status(500).json({
//       success: false,
//       message:
//         err?.response?.data?.message ||
//         "Server error",
//     });
//   }
// };

// ============================================
// TRANSFER FUND WALLET -> TRADE WALLET
// ============================================

const transferToTradeWallet = async (req, res) => {
  let transaction;

  try {
    const { MID, amount } = req.body;

    if (!MID || !amount) {
      return res.status(400).json({
        success: false,
        message: "MID and amount are required",
      });
    }

    const transferAmount = Number(amount);

    if (transferAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid transfer amount",
      });
    }

    const pool = await poolPromise;

    // =========================
    // START TRANSACTION
    // =========================
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    const request = new sql.Request(transaction);

    // =========================
    // GET USER BALANCE
    // =========================
    const userResult = await request
      .input("userID", sql.VarChar, MID)
      .execute("Get_MyFundWallet");

    if (userResult.recordset.length === 0) {
      await transaction.rollback();

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.recordset[0];

    if (transferAmount > Number(user.Balance)) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: "Insufficient Fund Wallet balance",
      });
    }

    // =========================
    // INSERT HISTORY
    // =========================
    const historyResult = await request
      .input("MID2", sql.VarChar, MID)
      .input("TransferAmount", sql.Decimal(18, 2), transferAmount).query(`
        INSERT INTO TradeWalletTransferHistory
        (
          MID,
          Amount,
          TransferDate,
          Status
        )
        OUTPUT INSERTED.*
        VALUES
        (
          @MID2,
          @TransferAmount,
          GETDATE(),
          'Completed'
        )
      `);

    // =========================
    // COMMIT
    // =========================
    await transaction.commit();

    return res.json({
      success: true,
      message: "Transfer successful",
      transfer: historyResult.recordset[0],
    });
  } catch (err) {
    console.log(err);

    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ============================================
// TRANSFER HISTORY
// ============================================

const getTradeWalletTransferHistory = async (req, res) => {
  const { MID } = req.query;

  try {
    const pool = await poolPromise;

    let query = `
        SELECT TOP 100
          wid,
          MID,
          Amount,
          PDate,
          Status,
          Mode,
          BAnk,
          deduction,
          PayMobNo
        FROM BankTransferNew
      `;

    const request = pool.request();

    if (MID) {
      request.input("MID", sql.VarChar, MID);
      query += ` WHERE MID = @MID `;
    }

    query += ` ORDER BY Id DESC`;

    const result = await request.query(query);

    return res.json({
      success: true,
      data: result.recordset,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const withdrawRequest = async (req, res) => {
  let transaction;

  try {
    const { MID, Name, Amount, WalletAddress } = req.body;

    if (!MID || !Amount || !WalletAddress) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const amount = Number(Amount);

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const pool = await poolPromise;

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);

    // =========================================================
    // GET USER
    // =========================================================
    const userResult = await request.input("MID", sql.VarChar, MID).query(`
        SELECT TOP 1 
          m.MID,
          m.Name,
          md.Address,
          m.Balance
        FROM Get_MemberDashboard m
        LEFT JOIN member_details md ON m.MID = md.MID
        WHERE m.MID = @MID
      `);

    const user = userResult.recordset[0];

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // =========================================================
    // WALLET CHECK
    // =========================================================
    if (!user.Address || user.Address !== WalletAddress) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid wallet address",
      });
    }

    // =========================================================
    // BALANCE CHECK
    // =========================================================
    if (amount > user.Balance) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // =========================================================
    // INSERT WITHDRAW REQUEST
    // =========================================================
    await request
      .input("MID", sql.VarChar, MID) // ✅ FIXED
      .input("Name", sql.VarChar, Name)
      .input("ExchAddress", sql.VarChar, WalletAddress)
      .input("Coin", sql.VarChar, "USDT")
      .input("AdminCharge", sql.Decimal(18, 2), 0)
      .input("Tax", sql.Decimal(18, 2), 0)
      .input("Payable", sql.Decimal(18, 2), amount)
      .input("Status", sql.VarChar, "PENDING")
      .input("Remark", sql.VarChar, "Withdrawal Request")
      .input("Flag", sql.Int, 0)
      .input("ModifyDate", sql.DateTime, new Date())
      .input("Profit", sql.Decimal(18, 2), 0).query(`
        INSERT INTO SendToTrustWallet
        (MID, Name, ExchAddress, Coin, AdminCharge, Tax, Payable, Status, Remark, Flag, ModifyDate, Profit)
        VALUES
        (@MID, @Name, @ExchAddress, @Coin, @AdminCharge, @Tax, @Payable, @Status, @Remark, @Flag, @ModifyDate, @Profit)
      `);

    // =========================================================
    // COMMIT
    // =========================================================
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
    });
  } catch (error) {
    console.log(error);

    if (transaction) {
      await transaction.rollback();
    }

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

module.exports = {
  withdrawRequest,
  getTradeWalletTransferHistory,
  transferToTradeWallet,
  withdrawalRequest,
};
