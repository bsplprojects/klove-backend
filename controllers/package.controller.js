const { poolPromise, sql } = require("../config/db");

/* =========================
   CREATE PRODUCT
========================= */
exports.createProduct = async (req, res) => {
  try {
    const {
      ProductCategory,
      ProductSubCategory,
      Description,
      Price,
      Image,
      PV,
    } = req.body;

    if (
      !ProductCategory ||
      !ProductSubCategory ||
      !Price ||
      !PV
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    const pool = await poolPromise;

    await pool
      .request()
      .input("ProductCategory", sql.VarChar(100), ProductCategory)
      .input("ProductSubCategory", sql.VarChar(200), ProductSubCategory)
      .input("Description", sql.VarChar(sql.MAX), Description || "")
      .input("Price", sql.Decimal(18, 2), Price)
      .input("Image", sql.VarChar(500), Image || "")
      .input("PV", sql.Decimal(18, 2), PV)
      .query(`
        INSERT INTO ProductSubcategory
        (
          ProductCategory,
          ProductSubCategory,
          Description,
          Price,
          Image,
          PV
        )
        VALUES
        (
          @ProductCategory,
          @ProductSubCategory,
          @Description,
          @Price,
          @Image,
          @PV
        )
      `);

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
    });
  } catch (error) {
    console.log("CREATE PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET ALL PRODUCTS
========================= */
exports.getAllProducts = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT
        Id,
        ProductCategory,
        ProductSubCategory,
        Description,
        Price,
        Image,
        PV
      FROM ProductSubcategory
      ORDER BY Id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.log("GET PRODUCTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   GET PRODUCT BY ID
========================= */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT *
        FROM ProductSubcategory
        WHERE Id = @Id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.recordset[0],
    });
  } catch (error) {
    console.log("GET PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   UPDATE PRODUCT
========================= */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      ProductCategory,
      ProductSubCategory,
      Description,
      Price,
      Image,
      PV,
    } = req.body;

    const pool = await poolPromise;

    const exists = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT Id
        FROM ProductSubcategory
        WHERE Id = @Id
      `);

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await pool
      .request()
      .input("Id", sql.Int, id)
      .input("ProductCategory", sql.VarChar(100), ProductCategory)
      .input("ProductSubCategory", sql.VarChar(200), ProductSubCategory)
      .input("Description", sql.VarChar(sql.MAX), Description || "")
      .input("Price", sql.Decimal(18, 2), Price)
      .input("Image", sql.VarChar(500), Image || "")
      .input("PV", sql.Decimal(18, 2), PV)
      .query(`
        UPDATE ProductSubcategory
        SET
          ProductCategory = @ProductCategory,
          ProductSubCategory = @ProductSubCategory,
          Description = @Description,
          Price = @Price,
          Image = @Image,
          PV = @PV
        WHERE Id = @Id
      `);

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.log("UPDATE PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   DELETE PRODUCT
========================= */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const exists = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT Id
        FROM ProductSubcategory
        WHERE Id = @Id
      `);

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        DELETE FROM ProductSubcategory
        WHERE Id = @Id
      `);

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.log("DELETE PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* =========================
   SEARCH PRODUCT
========================= */
exports.searchProducts = async (req, res) => {
  try {
    const { keyword } = req.query;

    const pool = await poolPromise;

    const result = await pool
      .request()
      .input("keyword", sql.VarChar(200), `%${keyword || ""}%`)
      .query(`
        SELECT *
        FROM ProductSubcategory
        WHERE
          ProductCategory LIKE @keyword
          OR ProductSubCategory LIKE @keyword
          OR Description LIKE @keyword
        ORDER BY Id DESC
      `);

    return res.status(200).json({
      success: true,
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (error) {
    console.log("SEARCH PRODUCT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Package Id is required",
      });
    }

    const pool = await poolPromise;

    const checkPackage = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT Id, PV
        FROM ProductSubcategory
        WHERE Id = @Id
      `);

    if (checkPackage.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Package not found",
      });
    }

    const currentStatus =
      checkPackage.recordset[0].PV || "Inactive";

    // Agar already active hai to inactive kar do
    if (currentStatus === "Active") {
      await pool
        .request()
        .input("Id", sql.Int, id)
        .query(`
          UPDATE ProductSubcategory
          SET PV = 'Inactive'
          WHERE Id = @Id
        `);

      return res.status(200).json({
        success: true,
        message: "Package Inactive Successfully",
      });
    }

    // Sab packages inactive
    await pool.request().query(`
      UPDATE ProductSubcategory
      SET PV = 'Inactive'
    `);

    // Selected package active
    await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        UPDATE ProductSubcategory
        SET PV = 'Active'
        WHERE Id = @Id
      `);

    return res.status(200).json({
      success: true,
      message: "Package Activated Successfully",
    });
  } catch (error) {
    console.log("TOGGLE STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};