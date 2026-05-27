const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const {
 
  loginVerify,getSponsor,register
} = require("../controllers/auth.controller");


router.post("/login", loginVerify);
router.get("/sponsor/:sponsorId", getSponsor);
router.post("/register", register); 

module.exports = router;