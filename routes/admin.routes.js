const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");

// ==========================
// ADMIN MEMBER REPORT
// ==========================
router.get(
  "/member-report",
  adminController.memberReport
);

// ==========================
// ACTIVATE ACCOUNT
// ==========================
router.post(
  "/activate-account",
  adminController.activateAccount
);

// ==========================
// SEND FUND
// ==========================
router.post(
  "/send-fund",
  adminController.sendfund
);
// ==========================
// SEND FUND
// ==========================
router.get(
  "/topup-report",
  adminController.topupReport
);
// ==========================
// SEND FUND
// ==========================
router.get(
  "/withdrawal-report",
  adminController.withdrawReport
);

module.exports = router;