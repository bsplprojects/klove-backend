const express = require("express");
const router = express.Router();

const {
  executeTrade,
  getTradeHistory,updateTradeStatus
} = require("../controllers/trade.controller");

// EXECUTE TRADE
router.post("/execute", executeTrade);

// HISTORY
router.get("/history/:memberId", getTradeHistory);

// STATUS
router.get("/status-update/:memberId", updateTradeStatus);

module.exports = router;