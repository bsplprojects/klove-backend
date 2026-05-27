const { sql, poolPromise } = require("../config/db");
const bcrypt = require("bcrypt");

// =====================================
// LOGIN
// =====================================
exports.loginVerify = async (req, res) => {
  try {
    const { UserName, Password } = req.body;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("UserName", sql.VarChar, UserName)
      .query(`
        SELECT * FROM Member_Details
        WHERE ConsumerID = @UserName
      `);

    if (result.recordset.length === 0) {
      return res.json({
        success: false,
        message: "User Not Found",
      });
    }

    const user = result.recordset[0];

    // ✅ bcrypt password check
    const isMatch = await bcrypt.compare(
      Password,
      user.Password
    );

    if (!isMatch) {
      return res.json({
        success: false,
        message: "Wrong Password",
      });
    }

    return res.json({
      success: true,
      message: "Login Successful",
      UserName: user.ConsumerID,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// =====================================
// REGISTER
// =====================================
exports.register = async (req, res) => {
  try {
    const {
      sponsorId,
      name,
      phone,
      email,
      password,
    } = req.body;

    // ================= VALIDATION =================
    if (!sponsorId || !name || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      });
    }

    const pool = await poolPromise;

    // ================= CHECK SPONSOR =================
    const sponsor = await pool
      .request()
      .input("sponsorId", sql.VarChar, sponsorId)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE ConsumerID = @sponsorId
      `);

    if (!sponsor.recordset.length) {
      return res.status(400).json({
        success: false,
        error: "Invalid Sponsor ID",
      });
    }

    // ================= CHECK EMAIL =================
    const existingEmail = await pool
      .request()
      .input("email", sql.VarChar, email)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE PhoneNo = @email
      `);

    if (existingEmail.recordset.length) {
      return res.status(400).json({
        success: false,
        error: "Email already exists",
      });
    }

    // ================= CHECK PHONE =================
    const existingPhone = await pool
      .request()
      .input("phone", sql.VarChar, phone)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE MobileNo = @phone
      `);

    if (existingPhone.recordset.length) {
      return res.status(400).json({
        success: false,
        error: "Phone number already exists",
      });
    }

    // ================= USER ID =================
    const userId =
      "JBM" + Math.floor(100000 + Math.random() * 900000);

    // ================= HASH PASSWORD =================
    const hashedPassword = await bcrypt.hash(password, 10);

    // ================= INSERT USER =================
    await pool
      .request()
      .input("name", sql.VarChar, name)
      .input("phone", sql.VarChar, phone)
      .input("email", sql.VarChar, email)
      .input("password", sql.VarChar, hashedPassword)
      .input("sponsorId", sql.VarChar, sponsorId)
      .input("userId", sql.VarChar, userId)
      .query(`
        INSERT INTO Member_Details
        (
          ConsumerID,
          SponsorID,
          Name,
          MobileNo,
          PhoneNo,
          Password,
          JoiningDate
        )
        VALUES
        (
          @userId,
          @sponsorId,
          @name,
          @phone,
          @email,
          @password,
          GETDATE()
        )
      `);

    // ================= GET USER =================
    const user = await pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query(`
        SELECT *
        FROM Member_Details
        WHERE ConsumerID = @userId
      `);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: user.recordset[0],
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
  }
};

// =====================================
// GET SPONSOR
// =====================================
exports.getSponsor = async (req, res) => {
  try {
    const { sponsorId } = req.params;

    if (!sponsorId) {
      return res.status(400).json({
        status: "FAILED",
        message: "Sponsor ID required",
      });
    }

    const pool = await poolPromise;

    const sponsor = await pool
      .request()
      .input("sponsorId", sql.VarChar, sponsorId)
      .query(`
        SELECT Name
        FROM Member_Details
        WHERE ConsumerID = @sponsorId
      `);

    if (!sponsor.recordset.length) {
      return res.status(404).json({
        status: "FAILED",
        message: "Sponsor not found",
      });
    }

    return res.json({
      status: "SUCCESS",
      name: sponsor.recordset[0].Name,
    });

  } catch (error) {
    console.log(error);

    return res.status(500).json({
      status: "FAILED",
      message: "Something went wrong",
    });
  }
};