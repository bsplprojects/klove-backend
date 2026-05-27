const router = require("express").Router();

const multer = require("multer");
const path = require("path");

const {
  addFundDeposit,
  getMemberReportByMID,
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

// MEMBER REPORT
router.get(
  "/report",
  getMemberReportByMID
);

module.exports = router;