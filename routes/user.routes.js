const router = require("express").Router();
const { getProfile,todayYesterdayReport,getCommissionHistory,updateProfile,changePassword,getP2pLedgerReport } = require("../controllers/user.controller");

router.get("/profile", getProfile);
router.get("/today-yesterday-report",todayYesterdayReport);
router.get("/commission-history", getCommissionHistory);
router.post("/update-profile", updateProfile);
router.post("/change-password", changePassword);
router.get("/p2p-ledger-report", getP2pLedgerReport);


module.exports = router;