const router = require("express").Router();

const {showDirectTeam,memberDownlineDetailsWithLevel,activatePlan,checkRoundActive} = require("../controllers/team.controller");

router.get("/direct-team/:userName", showDirectTeam);
router.get("/downline-team/:userId", memberDownlineDetailsWithLevel);
router.post("/activate-plan", activatePlan);
router.get(
  "/check-round-active/:memberId",
  checkRoundActive
);
module.exports = router;