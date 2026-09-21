const propertyService = require("../services/property.services");

const createListing = async (req, res) => {
  try {
    const ownerId = req.user.id; // tokenAuth middleware se aaya
    const ownerRole = req.user.role; // NOTE: confirm your auth middleware actually sets this

    const result = await propertyService.createListing(ownerId, ownerRole, req.body);

    return res.status(201).json({
      message: "Property listed successfully",
      property: result,
    });

  } catch (err) {
    console.error("Property controller error:", err.message);

    if (err.type === "VALIDATION") {
      return res.status(400).json({ error: err.message });
    }

    if (err.type === "LIMIT") {
      return res.status(403).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

// update listing
const updateListing = async (req, res) => {
  try {
    const result = await propertyService.updateListing(
      req.user.id,
      req.user.role,
      req.params.id,
      req.body
    );

    return res.json({
      message: "Property updated successfully",
      property: result
    });

  } catch (err) {
    console.error("Update listing error:", err.message);

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({ error: err.message });
    }

    if (err.type === "FORBIDDEN") {
      return res.status(403).json({ error: err.message });
    }

    if (err.type === "VALIDATION") {
      return res.status(400).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};


// delete listing
const deleteListing = async (req, res) => {
  try {
    const result = await propertyService.deleteListing(
      req.user.id,
      req.params.id
    );

    return res.json(result);

  } catch (err) {
    console.error("Delete listing error:", err.message);

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({ error: err.message });
    }

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};


//publish listing
const publishListing = async (req, res) => {
  try {
    const result = await propertyService.publishListing(
      req.user.id,
      req.user.role,
      req.params.id
    );

    return res.status(200).json(result);

  } catch (err) {
    console.error("Publish listing error:", err.message);

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({
        error: err.message
      });
    }

    if (err.type === "FORBIDDEN") {
      return res.status(403).json({
        error: err.message
      });
    }

    if (err.type === "VALIDATION") {
      return res.status(400).json({
        error: err.message
      });
    }

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};

// mark as sold
const markAsSold = async (req, res) => {
  try {
    const result = await propertyService.markAsSold(
      req.user.id,
      req.params.id
    );

    return res.json({
      message: "Property marked as sold",
      property: result
    });

  } catch (err) {
    console.error("Mark sold error:", err.message);

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({
        error: err.message
      });
    }

    return res.status(400).json({
      error: err.message
    });
  }
};


// const getAllProperties = async (req, res) => {
//   try {
//     const properties = await propertyService.getAllProperties(
//       req.user.role
//     );

//     return res.status(200).json({
//       count: properties.length,
//       properties,
//     });

//   } catch (err) {
//     console.error("Get properties error:", err.message);

//     return res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// };


const getOwnerPropertiesController = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await propertyService.getOwnerProperties(userId);

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// personal property details
const getPropertyDetailsController = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await propertyService.getPropertyDetails(id, userId);

    if (!result) {
      return res.status(404).json({
        message: "Property not found or you don't have access",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching property details:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};



const getPublicPropertiesController = async (req, res) => {
  try {
    const result = await propertyService.getPublicProperties(req.query);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching public properties:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const getPublicPropertyDetailsController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await propertyService.getPublicPropertyDetails(id);

    if (!result) {
      return res.status(404).json({
        message: "Property not found",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching property details:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};


const approveTenantListing = async (req, res) => {
  try {
    const result =
      await propertyService.approveTenantListing(
        req.user.id,
        req.params.approvalId
      );

    return res.status(200).json(result);

  } catch (err) {
    console.error(
      "Approve tenant listing error:",
      err.message
    );

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({
        error: err.message
      });
    }

    if (err.type === "VALIDATION") {
      return res.status(400).json({
        error: err.message
      });
    }

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};


const rejectTenantListing = async (req, res) => {
  try {
    const result =
      await propertyService.rejectTenantListing(
        req.user.id,
        req.params.approvalId,
        req.body.rejection_reason
      );

    return res.status(200).json(result);

  } catch (err) {
    console.error(
      "Reject tenant listing error:",
      err.message
    );

    if (err.type === "NOT_FOUND") {
      return res.status(404).json({
        error: err.message
      });
    }

    if (err.type === "VALIDATION") {
      return res.status(400).json({
        error: err.message
      });
    }

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};


const getOwnerApprovalRequests = async (req, res) => {
  try {
    const result =
      await propertyService.getOwnerApprovalRequests(
        req.user.id
      );

    return res.status(200).json({
      approvals: result
    });

  } catch (err) {
    console.error(
      "Get approval requests error:",
      err.message
    );

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};


const previewNeighbourhoodController = async (req, res) => {
  try {
    const { eir_code } = req.query;

    if (!eir_code) {
      return res.status(400).json({
        error: "eir_code query param is required"
      });
    }

    const result = await propertyService.previewNeighbourhood(eir_code);

    return res.json(result);

  } catch (err) {
    console.error("====================================");
    console.error("NEIGHBOURHOOD PREVIEW ERROR");
    console.error("====================================");
    console.error(err);
    console.error("====================================");

    return res.status(500).json({
      error: err.message || "Failed to fetch neighbourhood preview",
      type: err.type || null
    });
  }
};


module.exports = { previewNeighbourhoodController, createListing, updateListing, deleteListing,  publishListing, markAsSold, getOwnerPropertiesController, getPropertyDetailsController, getPublicPropertiesController, getPublicPropertyDetailsController, getOwnerApprovalRequests, rejectTenantListing, approveTenantListing };