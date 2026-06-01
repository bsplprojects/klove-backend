const router = require("express").Router();

const {showDirectTeam,memberDownlineDetailsWithLevel,activatePlan,checkRoundActive,getTopupHistory} = require("../controllers/team.controller");

router.get("/direct-team/:userName", showDirectTeam);
router.get("/downline-team/:userId", memberDownlineDetailsWithLevel);
router.post("/activate-plan", activatePlan);
router.get(
  "/check-round-active/:memberId",
  checkRoundActive
);

router.get("/topup-history", getTopupHistory);
module.exports = router;