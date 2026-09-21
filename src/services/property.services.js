const db = require("../../db/conn");
const { fetchAndSaveNeighbourhood, previewNeighbourhood } = require("./neighbourhood.services");
const { getLocationFromEircode } = require("./location.services");

const MAX_ACTIVE_LISTINGS = 10;

/*
======================================================
HELPERS
======================================================
*/

const throwError = (type, message) => {
  throw { type, message };
};

/*
======================================================
CREATE LISTING
======================================================

OWNER:
- Creates a new property
- owner_id = logged-in user
- listed_by = logged-in user
- listing_source = owner
- priority = 100
- status = draft

TENANT:
- Must provide existing property_id
- Must have active authorization for that property
- We use the existing property record
- listed_by = tenant
- owner_id = actual owner
- listing_source = tenant
- priority = 50
- status = draft
*/

const createListing = async (userId, userRole, data) => {
  const {
    property_id,

    title,
    description,
    eir_code,
    bedrooms,
    bathrooms,
    furnishing,
    parking,
    patio,
    fitted_kitchen,
    asking_price,
  } = data;

  if (!["owner", "tenant", "buyer"].includes(userRole)) {
    throwError("VALIDATION", "Invalid user role");
  }

  const validFurnishing = ["furnished", "semi", "unfurnished"];

  if (furnishing && !validFurnishing.includes(furnishing)) {
    throwError("VALIDATION", "Invalid furnishing value");
  }

  /*
  ======================================================
  OWNER CREATES PROPERTY
  ======================================================
  */

  if (userRole === "owner") {
    if (!eir_code || asking_price === undefined || asking_price === null) {
      throwError("VALIDATION", "EIR code and asking price are required");
    }

    const client = await db.pool.connect();

    let property;

    try {
      await client.query("BEGIN");

      /*
      Prevent concurrent listing creation
      for same owner.
      */

      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        userId,
      ]);

      const countRes = await client.query(
        `
        SELECT COUNT(*)
        FROM properties
        WHERE owner_id = $1
          AND status != 'sold'
        `,
        [userId],
      );

      if (parseInt(countRes.rows[0].count, 10) >= MAX_ACTIVE_LISTINGS) {
        throwError(
          "LIMIT",
          `Listing limit reached. Maximum ${MAX_ACTIVE_LISTINGS} active listings allowed.`,
        );
      }

      const location = await getLocationFromEircode(eir_code);

      const result = await client.query(
        `
        INSERT INTO properties
        (
          listed_by,
          owner_id,
          title,
          description,
          eir_code,
          city,
          county,
          locality,
          latitude,
          longitude,
          bedrooms,
          bathrooms,
          furnishing,
          parking,
          patio,
          fitted_kitchen,
          asking_price,
          status,
          listing_priority,
          listing_source
        )
        VALUES
        (
          $1,
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          'draft',
          100,
          'owner'
        )
        RETURNING *
        `,
        [
          userId,
          title || null,
          description || null,
          eir_code,
          location.city,
          location.county,
          location.locality,
          location.latitude,
          location.longitude,
          bedrooms ?? null,
          bathrooms ?? null,
          furnishing ?? null,
          parking ?? null,
          patio ?? null,
          fitted_kitchen ?? null,
          asking_price,
        ],
      );

      property = result.rows[0];

      await client.query("COMMIT");

      fetchAndSaveNeighbourhood(
        property.id,
        location.latitude,
        location.longitude,
      ).catch((err) => {
        console.error("Neighbourhood fetch failed:", err.message);
      });

      return property;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /*
  ======================================================
  TENANT CREATES LISTING
  ======================================================
  */

  if (userRole === "tenant") {
    if (!property_id) {
      throwError("VALIDATION", "property_id is required for tenant listings");
    }

    /*
    Find property + active authorization
    */

    const authRes = await db.query(
      `
      SELECT
        p.*,
        a.id AS authorization_id,
        a.owner_id AS authorized_owner_id,
        a.tenant_id AS authorized_tenant_id
      FROM properties p
      INNER JOIN property_tenant_authorizations a
        ON a.property_id = p.id
      WHERE p.id = $1
        AND a.tenant_id = $2
        AND a.status = 'active'
        AND (
          a.expires_at IS NULL
          OR a.expires_at > NOW()
        )
      `,
      [property_id, userId],
    );

    if (!authRes.rows.length) {
      throwError(
        "FORBIDDEN",
        "You are not authorized to advertise this property",
      );
    }

    const property = authRes.rows[0];

    /*
    Make sure property belongs to the authorized owner.
    */

    if (!property.authorized_owner_id) {
      throwError("VALIDATION", "Property owner could not be identified");
    }

    /*
    Do not allow tenant to advertise a sold property.
    */

    if (property.status === "sold") {
      throwError("VALIDATION", "Sold property cannot be listed");
    }

    /*
    If owner currently has an active listing,
    tenant cannot replace it.
    Owner has priority.
    */

    if (property.status === "active" && property.listing_source === "owner") {
      throwError(
        "VALIDATION",
        "This property is currently being advertised by the owner",
      );
    }

    /*
    Update the existing property.

    We DO NOT activate it.
    */

    const result = await db.query(
      `
      UPDATE properties
      SET
        listed_by = $1,
        owner_id = $2,

        title = COALESCE($3, title),
        description = COALESCE($4, description),
        eir_code = COALESCE($5, eir_code),
        bedrooms = COALESCE($6, bedrooms),
        bathrooms = COALESCE($7, bathrooms),
        furnishing = COALESCE($8, furnishing),
        parking = COALESCE($9, parking),
        patio = COALESCE($10, patio),
        fitted_kitchen = COALESCE($11, fitted_kitchen),
        asking_price = COALESCE($12, asking_price),

        status = 'draft',
        listing_source = 'tenant',
        listing_priority = 50,
        updated_at = NOW()

      WHERE id = $13

      RETURNING *
      `,
      [
        userId,
        property.authorized_owner_id,
        title ?? null,
        description ?? null,
        eir_code ?? null,
        bedrooms ?? null,
        bathrooms ?? null,
        furnishing ?? null,
        parking ?? null,
        patio ?? null,
        fitted_kitchen ?? null,
        asking_price ?? null,
        property_id,
      ],
    );

    return result.rows[0];
  }

  /*
  buyer is not allowed to create a property listing.
  */

  throwError("FORBIDDEN", "Buyers are not allowed to create property listings");
};

/*
======================================================
UPDATE LISTING
======================================================
*/

const updateListing = async (userId, userRole, propertyId, data) => {
  const propertyRes = await db.query(
    `
    SELECT *
    FROM properties
    WHERE id = $1
    `,
    [propertyId],
  );

  if (!propertyRes.rows.length) {
    throwError("NOT_FOUND", "Property not found");
  }

  const property = propertyRes.rows[0];

  /*
  Owner can update his own property.
  */

  const isOwner = userRole === "owner" && property.owner_id === userId;

  /*
  Tenant can update only if:
  - tenant is current listing owner
  - tenant has active authorization
  */

  let isAuthorizedTenant = false;

  if (userRole === "tenant") {
    const authRes = await db.query(
      `
      SELECT id
      FROM property_tenant_authorizations
      WHERE property_id = $1
        AND tenant_id = $2
        AND owner_id = $3
        AND status = 'active'
        AND (
          expires_at IS NULL
          OR expires_at > NOW()
        )
      LIMIT 1
      `,
      [propertyId, userId, property.owner_id],
    );

    isAuthorizedTenant =
      authRes.rows.length > 0 && property.listed_by === userId;
  }

  if (!isOwner && !isAuthorizedTenant) {
    throwError(
      "FORBIDDEN",
      "You do not have permission to update this property",
    );
  }

  if (property.status === "sold") {
    throwError("VALIDATION", "Sold property cannot be updated");
  }

  if (
    data.furnishing &&
    !["furnished", "semi", "unfurnished"].includes(data.furnishing)
  ) {
    throwError("VALIDATION", "Invalid furnishing value");
  }

  const result = await db.query(
    `
    UPDATE properties
    SET
      title = COALESCE($1, title),
      description = COALESCE($2, description),
      eir_code = COALESCE($3, eir_code),
      bedrooms = COALESCE($4, bedrooms),
      bathrooms = COALESCE($5, bathrooms),
      furnishing = COALESCE($6, furnishing),
      parking = COALESCE($7, parking),
      patio = COALESCE($8, patio),
      fitted_kitchen = COALESCE($9, fitted_kitchen),
      asking_price = COALESCE($10, asking_price),
      updated_at = NOW()
    WHERE id = $11
    RETURNING *
    `,
    [
      data.title ?? null,
      data.description ?? null,
      data.eir_code ?? null,
      data.bedrooms ?? null,
      data.bathrooms ?? null,
      data.furnishing ?? null,
      data.parking ?? null,
      data.patio ?? null,
      data.fitted_kitchen ?? null,
      data.asking_price ?? null,
      propertyId,
    ],
  );

  return result.rows[0];
};

/*
======================================================
PUBLISH LISTING
======================================================

OWNER:
    draft → active

TENANT:
    draft → pending_owner_approval
    creates approval request

======================================================
*/

const publishListing = async (userId, userRole, propertyId) => {
  const propertyRes = await db.query(
    `
    SELECT *
    FROM properties
    WHERE id = $1
    `,
    [propertyId],
  );

  if (!propertyRes.rows.length) {
    throwError("NOT_FOUND", "Property not found");
  }

  const property = propertyRes.rows[0];

  /*
  ======================================================
  OWNER PUBLISH
  ======================================================
  */

  if (userRole === "owner") {
    if (property.owner_id !== userId) {
      throwError(
        "FORBIDDEN",
        "You do not have permission to publish this property",
      );
    }

    if (property.status === "active") {
      throwError("VALIDATION", "Property is already published");
    }

    if (property.status === "sold") {
      throwError("VALIDATION", "Sold property cannot be published");
    }

    if (property.status === "inactive") {
      throwError("VALIDATION", "Inactive property cannot be published");
    }

    /*
    Owner takes priority.

    If tenant listing exists/pending,
    owner publication cancels tenant approval.
    */

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        SELECT pg_advisory_xact_lock(hashtext($1))
        `,
        [propertyId],
      );

      /*
      Cancel pending tenant approvals
      */

      await client.query(
        `
        UPDATE property_listing_approvals
        SET
          status = 'cancelled',
          updated_at = NOW()
        WHERE property_id = $1
          AND status = 'pending'
        `,
        [propertyId],
      );

      const result = await client.query(
        `
        UPDATE properties
        SET
          listed_by = $1,
          owner_id = $1,
          listing_source = 'owner',
          listing_priority = 100,
          status = 'active',
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [userId, propertyId],
      );

      await client.query("COMMIT");

      return {
        message: "Property published successfully",
        property: result.rows[0],
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /*
  ======================================================
  TENANT PUBLISH
  ======================================================
  */

  if (userRole === "tenant") {
    /*
    Tenant must be the current listing user.
    */

    if (property.listed_by !== userId) {
      throwError(
        "FORBIDDEN",
        "You do not have permission to publish this property",
      );
    }

    /*
    Verify active authorization.
    */

    const authRes = await db.query(
      `
      SELECT *
      FROM property_tenant_authorizations
      WHERE property_id = $1
        AND tenant_id = $2
        AND owner_id = $3
        AND status = 'active'
        AND (
          expires_at IS NULL
          OR expires_at > NOW()
        )
      LIMIT 1
      `,
      [propertyId, userId, property.owner_id],
    );

    if (!authRes.rows.length) {
      throwError(
        "FORBIDDEN",
        "You are not authorized to advertise this property",
      );
    }

    if (property.status === "active") {
      throwError("VALIDATION", "Property is already actively listed");
    }

    if (property.status === "sold") {
      throwError("VALIDATION", "Sold property cannot be published");
    }

    if (property.status === "inactive") {
      throwError("VALIDATION", "Inactive property cannot be published");
    }

    /*
    ======================================================
    CHECK EXISTING APPROVAL
    ======================================================
    */

    const existingApproval = await db.query(
      `
      SELECT *
      FROM property_listing_approvals
      WHERE property_id = $1
        AND tenant_id = $2
        AND status = 'pending'
      LIMIT 1
      `,
      [propertyId, userId],
    );

    if (existingApproval.rows.length) {
      throwError("VALIDATION", "An owner approval request is already pending");
    }

    /*
    ======================================================
    CREATE APPROVAL REQUEST
    ======================================================
    */

    const approvalResult = await db.query(
      `
      INSERT INTO property_listing_approvals
      (
        property_id,
        tenant_id,
        owner_id,
        status
      )
      VALUES
      (
        $1,
        $2,
        $3,
        'pending'
      )
      RETURNING *
      `,
      [propertyId, userId, property.owner_id],
    );

    const approval = approvalResult.rows[0];

    /*
    ======================================================
    CHANGE PROPERTY STATUS
    ======================================================
    */

    const propertyResult = await db.query(
      `
      UPDATE properties
      SET
        status = 'pending_owner_approval',
        listing_source = 'tenant',
        listing_priority = 50,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [propertyId],
    );

    /*
    ======================================================
    OWNER NOTIFICATION RECORD
    ======================================================

    Actual email sending will be handled by
    notification/email service.

    recipient_email currently uses owner email.
    If email_enc is encrypted in your system,
    use your existing decrypt function here.
    */

    const ownerRes = await db.query(
      `
      SELECT email_enc
      FROM users
      WHERE id = $1
      `,
      [property.owner_id],
    );

    if (ownerRes.rows.length) {
      const ownerEmail = ownerRes.rows[0].email_enc;

      if (ownerEmail) {
        await db.query(
          `
          INSERT INTO property_approval_notifications
          (
            approval_id,
            notification_type,
            recipient_email
          )
          VALUES
          (
            $1,
            'approval_request',
            $2
          )
          `,
          [approval.id, ownerEmail],
        );
      }
    }

    return {
      message: "Listing approval request sent to the property owner",

      property: propertyResult.rows[0],

      approval: {
        id: approval.id,
        status: approval.status,
      },
    };
  }

  throwError("FORBIDDEN", "You are not allowed to publish listings");
};

/*
======================================================
OWNER APPROVE TENANT LISTING
======================================================
*/

const approveTenantListing = async (ownerId, approvalId) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    /*
    Lock approval row.
    */

    const approvalRes = await client.query(
      `
      SELECT *
      FROM property_listing_approvals
      WHERE id = $1
        AND owner_id = $2
      FOR UPDATE
      `,
      [approvalId, ownerId],
    );

    if (!approvalRes.rows.length) {
      throwError("NOT_FOUND", "Approval request not found");
    }

    const approval = approvalRes.rows[0];

    if (approval.status !== "pending") {
      throwError(
        "VALIDATION",
        `Approval request is already ${approval.status}`,
      );
    }

    /*
    Lock property.
    */

    const propertyRes = await client.query(
      `
      SELECT *
      FROM properties
      WHERE id = $1
      FOR UPDATE
      `,
      [approval.property_id],
    );

    if (!propertyRes.rows.length) {
      throwError("NOT_FOUND", "Property not found");
    }

    const property = propertyRes.rows[0];

    /*
    Owner always wins.

    If owner already has active listing,
    tenant approval cannot go live.
    */

    if (property.status === "active" && property.listing_source === "owner") {
      throwError(
        "VALIDATION",
        "Owner already has an active listing for this property",
      );
    }

    if (property.status === "sold") {
      throwError("VALIDATION", "Sold property cannot be listed");
    }

    /*
    Approve request.
    */

    const approvalUpdate = await client.query(
      `
      UPDATE property_listing_approvals
      SET
        status = 'approved',
        owner_response_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [approvalId],
    );

    /*
    Make tenant listing live.
    */

    const propertyUpdate = await client.query(
      `
      UPDATE properties
      SET
        listed_by = $1,
        owner_id = $2,
        listing_source = 'tenant',
        listing_priority = 50,
        status = 'active',
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [approval.tenant_id, ownerId, approval.property_id],
    );

    /*
    Notification record.
    */

    const tenantRes = await client.query(
      `
      SELECT email_enc
      FROM users
      WHERE id = $1
      `,
      [approval.tenant_id],
    );

    if (tenantRes.rows.length && tenantRes.rows[0].email_enc) {
      await client.query(
        `
        INSERT INTO property_approval_notifications
        (
          approval_id,
          notification_type,
          recipient_email
        )
        VALUES
        (
          $1,
          'approved',
          $2
        )
        `,
        [approvalId, tenantRes.rows[0].email_enc],
      );
    }

    await client.query("COMMIT");

    return {
      message: "Tenant listing approved successfully",

      approval: approvalUpdate.rows[0],

      property: propertyUpdate.rows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/*
======================================================
OWNER REJECT TENANT LISTING
======================================================
*/

const rejectTenantListing = async (ownerId, approvalId, rejectionReason) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const approvalRes = await client.query(
      `
      SELECT *
      FROM property_listing_approvals
      WHERE id = $1
        AND owner_id = $2
      FOR UPDATE
      `,
      [approvalId, ownerId],
    );

    if (!approvalRes.rows.length) {
      throwError("NOT_FOUND", "Approval request not found");
    }

    const approval = approvalRes.rows[0];

    if (approval.status !== "pending") {
      throwError(
        "VALIDATION",
        `Approval request is already ${approval.status}`,
      );
    }

    const approvalUpdate = await client.query(
      `
      UPDATE property_listing_approvals
      SET
        status = 'rejected',
        rejection_reason = $1,
        owner_response_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [rejectionReason || null, approvalId],
    );

    /*
    Property goes back to draft.

    It remains associated with tenant,
    but is not publicly visible.
    */

    await client.query(
      `
      UPDATE properties
      SET
        status = 'draft',
        updated_at = NOW()
      WHERE id = $1
        AND status = 'pending_owner_approval'
      `,
      [approval.property_id],
    );

    /*
    Tenant notification record.
    */

    const tenantRes = await client.query(
      `
      SELECT email_enc
      FROM users
      WHERE id = $1
      `,
      [approval.tenant_id],
    );

    if (tenantRes.rows.length && tenantRes.rows[0].email_enc) {
      await client.query(
        `
        INSERT INTO property_approval_notifications
        (
          approval_id,
          notification_type,
          recipient_email
        )
        VALUES
        (
          $1,
          'rejected',
          $2
        )
        `,
        [approvalId, tenantRes.rows[0].email_enc],
      );
    }

    await client.query("COMMIT");

    return {
      message: "Tenant listing rejected successfully",

      approval: approvalUpdate.rows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/*
======================================================
GET OWNER APPROVAL REQUESTS
======================================================
*/

const getOwnerApprovalRequests = async (ownerId) => {
  const result = await db.query(
    `
    SELECT
      a.id,
      a.property_id,
      a.tenant_id,
      a.owner_id,
      a.status,
      a.owner_response_at,
      a.rejection_reason,
      a.created_at,
      a.updated_at,

      u.full_name AS tenant_name,

      p.title AS property_title,
      p.eir_code,
      p.asking_price,
      p.status AS property_status

    FROM property_listing_approvals a

    INNER JOIN users u
      ON u.id = a.tenant_id

    INNER JOIN properties p
      ON p.id = a.property_id

    WHERE a.owner_id = $1

    ORDER BY a.created_at DESC
    `,
    [ownerId],
  );

  return result.rows;
};

/*
======================================================
DELETE LISTING
======================================================
*/

const deleteListing = async (userId, userRole, propertyId) => {
  const propertyRes = await db.query(
    `
    SELECT *
    FROM properties
    WHERE id = $1
    `,
    [propertyId],
  );

  if (!propertyRes.rows.length) {
    throwError("NOT_FOUND", "Property not found");
  }

  const property = propertyRes.rows[0];

  let allowed = false;

  if (userRole === "owner" && property.owner_id === userId) {
    allowed = true;
  }

  if (userRole === "tenant" && property.listed_by === userId) {
    const authRes = await db.query(
      `
      SELECT id
      FROM property_tenant_authorizations
      WHERE property_id = $1
        AND tenant_id = $2
        AND owner_id = $3
        AND status = 'active'
        AND (
          expires_at IS NULL
          OR expires_at > NOW()
        )
      LIMIT 1
      `,
      [propertyId, userId, property.owner_id],
    );

    allowed = authRes.rows.length > 0;
  }

  if (!allowed) {
    throwError(
      "FORBIDDEN",
      "You do not have permission to remove this listing",
    );
  }

  if (property.status === "sold") {
    throwError("VALIDATION", "Sold property cannot be deleted");
  }

  /*
  Cancel pending approvals.
  */

  await db.query(
    `
    UPDATE property_listing_approvals
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE property_id = $1
      AND status = 'pending'
    `,
    [propertyId],
  );

  /*
  Don't physically delete the property.
  */

  const result = await db.query(
    `
    UPDATE properties
    SET
      status = 'inactive',
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [propertyId],
  );

  return {
    message: "Listing removed successfully",
    property: result.rows[0],
  };
};

/*
======================================================
MARK AS SOLD
======================================================
*/

const markAsSold = async (ownerId, propertyId) => {
  const result = await db.query(
    `
    UPDATE properties
    SET
      status = 'sold',
      updated_at = NOW()
    WHERE id = $1
      AND owner_id = $2
    RETURNING *
    `,
    [propertyId, ownerId],
  );

  if (!result.rows.length) {
    throwError("NOT_FOUND", "Property not found or you are not the owner");
  }

  /*
  Cancel any pending tenant approvals.
  */

  await db.query(
    `
    UPDATE property_listing_approvals
    SET
      status = 'cancelled',
      updated_at = NOW()
    WHERE property_id = $1
      AND status = 'pending'
    `,
    [propertyId],
  );

  return result.rows[0];
};

/*
======================================================
GET ALL OWNER / TENANT PROPERTIES
======================================================
*/

const getOwnerProperties = async (userId) => {
  const result = await db.query(
    `
    SELECT
      p.*,
      (
        SELECT pi.image_url
        FROM property_images pi
        WHERE pi.property_id = p.id
        ORDER BY pi.position ASC, pi.created_at ASC
        LIMIT 1
      ) AS cover_image
    FROM properties p
    WHERE p.owner_id = $1
       OR p.listed_by = $1
    ORDER BY p.created_at DESC
    `,
    [userId],
  );

  return result.rows;
};

/*
======================================================
GET PROPERTY DETAILS FOR OWNER / TENANT
======================================================
*/

const getPropertyDetails = async (propertyId, userId) => {
  const propertyRes = await db.query(
    `
    SELECT *
    FROM properties
    WHERE id = $1
      AND (
        owner_id = $2
        OR listed_by = $2
      )
    `,
    [propertyId, userId],
  );

  if (!propertyRes.rows.length) {
    return null;
  }

  const property = propertyRes.rows[0];

  const imagesRes = await db.query(
    `
    SELECT *
    FROM property_images
    WHERE property_id = $1
    ORDER BY position ASC, created_at ASC
    `,
    [propertyId],
  );

  const neighbourhoodRes = await db.query(
    `
    SELECT *
    FROM property_neighbourhood
    WHERE property_id = $1
    ORDER BY place_type, name
    `,
    [propertyId],
  );

  return {
    ...property,
    images: imagesRes.rows,
    neighbourhood: neighbourhoodRes.rows,
  };
};

/*
======================================================
MASK EIRCODE
======================================================
*/

const maskEircode = (eircode) => {
  if (!eircode) {
    return null;
  }

  if (eircode.length <= 3) {
    return eircode;
  }

  return `${eircode.substring(0, 3)}****`;
};

/*
======================================================
GET PUBLIC PROPERTIES
======================================================
*/

const getPublicProperties = async (filters = {}) => {
  const {
    min_price,
    max_price,
    bedrooms,
    bathrooms,
    eir_code,
    page = 1,
    limit = 20,
    sort = "newest",
  } = filters;

  const conditions = [`p.status = 'active'`];

  const values = [];
  let index = 1;

  if (min_price !== undefined) {
    conditions.push(`p.asking_price >= $${index}`);
    values.push(min_price);
    index++;
  }

  if (max_price !== undefined) {
    conditions.push(`p.asking_price <= $${index}`);
    values.push(max_price);
    index++;
  }

  if (bedrooms !== undefined) {
    conditions.push(`p.bedrooms = $${index}`);
    values.push(bedrooms);
    index++;
  }

  if (bathrooms !== undefined) {
    conditions.push(`p.bathrooms = $${index}`);
    values.push(bathrooms);
    index++;
  }

  if (eir_code) {
    conditions.push(`p.eir_code ILIKE $${index}`);
    values.push(`${eir_code}%`);
    index++;
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

  const safePage = Math.max(parseInt(page, 10) || 1, 1);

  const offset = (safePage - 1) * safeLimit;

  let orderBy = `p.created_at DESC`;

  if (sort === "price_asc") {
    orderBy = `p.asking_price ASC`;
  }

  if (sort === "price_desc") {
    orderBy = `p.asking_price DESC`;
  }

  if (sort === "oldest") {
    orderBy = `p.created_at ASC`;
  }

  values.push(safeLimit);
  const limitIndex = index;
  index++;

  values.push(offset);
  const offsetIndex = index;

  const result = await db.query(
    `
    SELECT
      p.id,
      p.title,
      p.description,
      p.bedrooms,
      p.bathrooms,
      p.furnishing,
      p.parking,
      p.patio,
      p.fitted_kitchen,
      p.asking_price,
      p.status,
      p.created_at,
      p.updated_at,
      p.city,
      p.county,
      p.locality,
      p.latitude,
      p.longitude,
      p.listing_priority,
      p.listing_source,

      (
        SELECT pi.image_url
        FROM property_images pi
        WHERE pi.property_id = p.id
        ORDER BY pi.position ASC, pi.created_at ASC
        LIMIT 1
      ) AS cover_image,

      p.eir_code

    FROM properties p

    WHERE ${conditions.join(" AND ")}

    ORDER BY
      p.listing_priority DESC,
      ${orderBy}

    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values,
  );

  const properties = result.rows.map((property) => ({
    ...property,
    eir_code: maskEircode(property.eir_code),
  }));

  return {
    page: safePage,
    limit: safeLimit,
    count: properties.length,
    properties,
  };
};

/*
======================================================
GET PUBLIC PROPERTY DETAILS
======================================================
*/

const getPublicPropertyDetails = async (propertyId) => {
  const propertyRes = await db.query(
    `
    SELECT
      *
    FROM properties
    WHERE id = $1
      AND status = 'active'
    `,
    [propertyId],
  );

  if (!propertyRes.rows.length) {
    return null;
  }

  const property = propertyRes.rows[0];

  const imagesRes = await db.query(
    `
    SELECT *
    FROM property_images
    WHERE property_id = $1
    ORDER BY position ASC, created_at ASC
    `,
    [propertyId],
  );

  const neighbourhoodRes = await db.query(
    `
    SELECT *
    FROM property_neighbourhood
    WHERE property_id = $1
    ORDER BY place_type, name
    `,
    [propertyId],
  );

  return {
    ...property,
    eir_code: maskEircode(property.eir_code),
    images: imagesRes.rows,
    neighbourhood: neighbourhoodRes.rows,
  };
};

module.exports = {
  createListing,
  updateListing,
  publishListing,

  approveTenantListing,
  rejectTenantListing,
  getOwnerApprovalRequests,

  deleteListing,
  markAsSold,

  getOwnerProperties,
  getPropertyDetails,
  getPublicProperties,
  getPublicPropertyDetails,
  maskEircode,

  previewNeighbourhood
};
