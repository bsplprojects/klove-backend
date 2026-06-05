const router = require("express").Router();
const {
  withdrawalRequest,
  transferToTradeWallet,
  getTradeWalletTransferHistory,
  withdrawRequest,
} = require("../controllers/withdraw.controller");

// POST /api/withdraw
router.post("/withdrawal", withdrawalRequest);
router.post("/transfer", transferToTradeWallet);

router.get("/history", getTradeWalletTransferHistory);
router.get("/withdrawal-request", withdrawRequest);

module.exports = router;
