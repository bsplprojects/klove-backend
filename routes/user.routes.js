const router = require("express").Router();
const { getProfile,todayYesterdayReport,getCommissionHistory } = require("../controllers/user.controller");

router.get("/profile", getProfile);
router.get("/today-yesterday-report",todayYesterdayReport);
router.get("/commission-history",getCommissionHistory);

module.exports = router;