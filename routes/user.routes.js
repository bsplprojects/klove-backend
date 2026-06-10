const router = require("express").Router();
const multer = require("multer");
const path = require("path");
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
  changeMemberPassword,
} = require("../controllers/user.controller");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads"));
  },

  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-qr-" + Math.round(Math.random() * 1e9);

    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
});

router.get("/profile", getProfile);
router.get("/today-yesterday-report", todayYesterdayReport);
router.get("/get-by-id", getSponsorById);
router.get("/commission-history", getCommissionHistory);
router.patch("/update-profile", upload.single("file"), updateProfile);
router.post("/change-password", changePassword);
router.post("/member-password", changeMemberPassword);
router.get("/p2p-ledger-report", getP2pLedgerReport);
router.get("/commission-history-all", getCommissionHistoryAll);
router.get("/growth-income-history", getGrowthIncomeHistoryAll);
router.get("/p2p-ledger-report-all", getP2pLedgerReportAll);

module.exports = router;
