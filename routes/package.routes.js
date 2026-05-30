const express = require("express");
const router = express.Router();

const packageController = require("../controllers/package.controller");

router.post("/create", packageController.createProduct);

router.get("/all", packageController.getAllProducts);

router.get("/search", packageController.searchProducts);

router.get("/:id", packageController.getProductById);

router.put("/:id", packageController.updateProduct);

router.delete("/:id", packageController.deleteProduct);
router.post(
  "/toggle-status",
  packageController.toggleProductStatus
);


module.exports = router;