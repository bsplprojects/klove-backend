const express = require("express");
const router = express.Router();

const {
  startMining,
  getMiningStatus,
  getMiningHistory,
} = require("../controllers/mining.controller");

// START MINING
router.post("/start", startMining);

// STATUS
router.get("/status/:MID", getMiningStatus);

// ✅ HISTORY
router.get("/history/:MID", getMiningHistory);

module.exports = router;