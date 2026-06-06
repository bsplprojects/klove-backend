const express = require("express");
const router = express.Router();
const { adminLogin } = require("../controllers/admin.auth");
const {
  updateRequestStatus,
  addUPIId,
  updateWithdrawalRequestStatus,
} = require("../controllers/admin.controller");

router.post("/login", adminLogin);
router.put("/request/:id", updateRequestStatus);
router.put("/request/withdrawal/:id", updateWithdrawalRequestStatus);
router.put("/upi/:id", addUPIId);

module.exports = router;
