const express = require("express");
const {
  getROIIncomeHistory,
  getLevelIncomeHistory,
  getReferralIncomeHistory,
} = require("../controllers/income.controller");

const router = express.Router();

router.route("/roi/:MID").get(getROIIncomeHistory);
router.route("/level/:MID").get(getLevelIncomeHistory);
router.route("/referral/:MID").get(getReferralIncomeHistory);

module.exports = router;
