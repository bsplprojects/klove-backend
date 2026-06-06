const express = require("express");
const {
  createTicket,
  getTickets,
  replyTicket,
} = require("../controllers/support.controller");

const router = express.Router();

router.route("/:MID").get(getTickets);
router.route("/:MID").post(createTicket);
router.route("/reply/:MID").put(replyTicket);

module.exports = router;
