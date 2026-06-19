const sql = require("mssql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../config/db");

// ==============================
// ADMIN LOGIN
// ==============================
adminLogin = async (req, res) => {
  try {
    const { memberId, password } = req.body;

    if (!memberId || !password) {
      return res.status(400).json({
        error: "MemberID & Password required",
      });
    }

    const pool = await db.poolPromise;

    const result = await pool.request().input("memberId", sql.VarChar, memberId)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE ConsumerID = @memberId
      `);


    if (result.recordset.length === 0) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    const user = result.recordset[0];

    if (user.Role !== "admin") {
      return res.status(403).json({
        error: "Access denied. Not admin.",
      });
    }

    const validPassword = await bcrypt.compare(password, user.Password);

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        id: user.Id,
        memberId: user.ConsumerID,
        role: user.Role,
      },
      process.env.JWT_SECRET || "SECRET",
      { expiresIn: "1d" },
    );

    return res.json({
      success: true,
      token,
      role: user.Role,
      user,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Server error",
    });
  }
};

module.exports = {
  adminLogin,
};
