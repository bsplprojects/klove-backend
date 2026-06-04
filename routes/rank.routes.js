const express = require("express");
const router = express.Router();

const getRankPool = require("../controllers/rank.controller");

router.get("/rank-pool/:MID", getRankPool.getRankPool);

module.exports = router;
