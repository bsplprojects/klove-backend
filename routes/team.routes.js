const router = require("express").Router();

const {showDirectTeam,memberDownlineDetailsWithLevel} = require("../controllers/team.controller");

router.get("/direct-team/:userName", showDirectTeam);
router.get("/downline-team/:userId", memberDownlineDetailsWithLevel);

module.exports = router;