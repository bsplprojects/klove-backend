const router = require("express").Router();
const { withdrawalRequest,transferToTradeWallet,getTradeWalletTransferHistory } = require("../controllers/withdraw.controller");

// POST /api/withdraw
router.post("/withdrawal", withdrawalRequest);
router.post("/transfer", transferToTradeWallet);

router.get("/history", getTradeWalletTransferHistory);

module.exports = router;