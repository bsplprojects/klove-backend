const router = require("express").Router();

const {showDirectTeam,memberDownlineDetailsWithLevel,activatePlan,checkRoundActive,getTopupHistory,getMyPlans} = require("../controllers/team.controller");

router.get("/direct-team/:userName", showDirectTeam);
router.get("/downline-team/:userId", memberDownlineDetailsWithLevel);
router.post("/activate-plan", activatePlan);
router.get(
  "/check-round-active/:memberId",
  checkRoundActive
);

router.get("/topup-history", getTopupHistory);
router.get("/my-plans/:memberId", getMyPlans);
module.exports = router;