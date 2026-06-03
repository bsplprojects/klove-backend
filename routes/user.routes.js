const router = require("express").Router();
const {
  getProfile,
  todayYesterdayReport,
  getCommissionHistory,
  updateProfile,
  changePassword,
  getCommissionHistoryAll,
  getGrowthIncomeHistoryAll,
  getP2pLedgerReport,
  getP2pLedgerReportAll,
  getSponsorById,
} = require("../controllers/user.controller");

router.get("/profile", getProfile);
router.get("/today-yesterday-report", todayYesterdayReport);
router.get("/get-by-id", getSponsorById);
router.get("/commission-history", getCommissionHistory);
router.patch("/update-profile", updateProfile);
router.post("/change-password", changePassword);
router.get("/p2p-ledger-report", getP2pLedgerReport);
router.get("/commission-history-all", getCommissionHistoryAll);
router.get("/growth-income-history", getGrowthIncomeHistoryAll);
router.get("/p2p-ledger-report-all", getP2pLedgerReportAll);

module.exports = router;
