const { poolPromise } = require("../config/db");
const sql = require("mssql");

const getTickets = async (req, res) => {
  try {
    const { MID } = req.params;
    const pool = await poolPromise;

    let query = `SELECT * FROM Message_Box`;

    const request = pool.request();

    if (MID && MID.toLowerCase() !== "admin") {
      query += ` WHERE MID = @MID`;
      request.input("MID", sql.VarChar, MID);
    }

    const result = await request.query(query);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      err: error.message,
    });
  }
};

const createTicket = async (req, res) => {
  try {
    const { subject, type, message } = req.body;
    const MID = req.params.MID;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Please provide the subject and message",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MID", sql.VarChar, MID)
      .input("subject", sql.VarChar, subject)
      .input("type", sql.VarChar, type)
      .input("message", sql.VarChar, message)
      .input("reqDate", sql.DateTime, new Date())
      .input("status", sql.VarChar, "pending").query(`
        INSERT INTO Message_Box (MID, Name, rType, Message, Status, reqDate)
        VALUES (@MID, @subject, @type, @message, @status, @reqDate);
    `);

    if (result.rowsAffected < 1) {
      return res.status(400).json({
        success: false,
        message: "Failed to raise ticket",
      });
    }

    return res.status(200).json({
      success: false,
      message: "Ticket created successfully, we will get back to you soon.",
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      err: error.response,
    });
  }
};

const replyTicket = async (req, res) => {
  try {
    const { reply } = req.body;
    const MID = +req.params.MID;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Please provide the reply for ticket",
      });
    }

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("MID", sql.Int, MID)
      .input("reply", sql.VarChar, reply)
      .input("resDAte", sql.DateTime, new Date())
      .input("status", sql.VarChar, "resolved").query(`
        UPDATE Message_Box
        SET AdminReply = @reply, resDAte = @resDAte, Status = @status
        WHERE ID = @MID;
    `);

    if (result.rowsAffected < 1) {
      return res.status(400).json({
        success: false,
        message: "Failed to reply ticket",
      });
    }

    return res.status(200).json({
      success: false,
      message: "Replied Successfully",
      data: result.recordset,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      err: error.response,
    });
  }
};

module.exports = {
  createTicket,
  getTickets,
  replyTicket,
};
