const express = require("express");

const router = express.Router();

const propertyController = require("../controllers/property.controller");

const tokenAuth = require("../middlewares/tokenAuth");

const roleAuth = require("../middlewares/roleAuth");


// ======================================================
// 🏠 LISTING MANAGEMENT
// OWNER + TENANT
// ======================================================

// Neighbourhood Preview (must come before any "/:id" routes below)
router.get(
  "/neighbourhood-preview",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.previewNeighbourhoodController
);

// Create Listing
router.post(
  "/",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.createListing
);


// Update Listing
router.put(
  "/:id",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.updateListing
);


// Delete Listing
router.delete(
  "/:id",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.deleteListing
);


// Publish / Request Owner Approval
router.patch(
  "/:id/publish",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.publishListing
);


// ======================================================
// 👑 OWNER ONLY
// ======================================================

// Mark as Sold
router.patch(
  "/:id/sold",
  tokenAuth,
  roleAuth("owner"),
  propertyController.markAsSold
);


// Owner: All My Properties
router.get(
  "/my-properties",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.getOwnerPropertiesController
);


// Owner/Tenant: Single Property
router.get(
  "/my-properties/:id",
  tokenAuth,
  roleAuth("owner", "tenant"),
  propertyController.getPropertyDetailsController
);


// ======================================================
// 👑 TENANT LISTING APPROVAL
// OWNER ONLY
// ======================================================

// Get tenant approval requests
router.get(
  "/approval-requests",
  tokenAuth,
  roleAuth("owner"),
  propertyController.getOwnerApprovalRequests
);


// Approve tenant listing
router.patch(
  "/approval-requests/:approvalId/approve",
  tokenAuth,
  roleAuth("owner"),
  propertyController.approveTenantListing
);


// Reject tenant listing
router.patch(
  "/approval-requests/:approvalId/reject",
  tokenAuth,
  roleAuth("owner"),
  propertyController.rejectTenantListing
);


// ======================================================
// 🟢 PUBLIC
// ======================================================

// Get all public properties
router.get(
  "/",
  propertyController.getPublicPropertiesController
);


// Get public property details
router.get(
  "/:id",
  propertyController.getPublicPropertyDetailsController
);


module.exports = router;