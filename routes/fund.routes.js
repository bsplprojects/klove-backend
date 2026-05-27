const router = require("express").Router();

const multer = require("multer");
const path = require("path");

const {
  addFundDeposit,
  getDepositReportByMID,
  repFundDeposit,
} = require("../controllers/fund.controller");

/* ================= MULTER ================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage });

/* ================= ROUTES ================= */

// ADD DEPOSIT REQUEST
router.post(
  "/deposit-request",
  upload.single("image"),
  repFundDeposit
);

// DIRECT DEPOSIT
router.post(
  "/deposit",
  addFundDeposit
);

router.get("/report/:MID", getDepositReportByMID);

module.exports = router;