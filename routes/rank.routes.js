const express = require("express");
const router = express.Router();

const getRankPool = require("../controllers/rank.controller");

router.post(
  "/rank-pool",
  getRankPool.getRankPool
);

module.exports = router;