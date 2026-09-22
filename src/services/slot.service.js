const db = require("../../db/conn");

const throwError = (type, message) => {
  throw { type, message };
};

/*
======================================================
GENERATE SLOTS (owner defines a window, we chunk into 30-min slots)
======================================================
*/

/*
`entries` shape: [{ date, start_time, end_time }, ...]
Each entry can have its own time window — owner isn't forced
into one pattern across every selected date.
*/
const generateSlots = async (ownerId, propertyId, entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    throwError("VALIDATION", "entries (array of { date, start_time, end_time }) is required");
  }

  if (entries.length > 60) {
    throwError("VALIDATION", "Cannot create slots for more than 60 entries at once");
  }

  for (const entry of entries) {
    if (!entry.date || !entry.start_time || !entry.end_time) {
      throwError("VALIDATION", "Each entry needs date, start_time and end_time");
    }
    if (entry.start_time >= entry.end_time) {
      throwError("VALIDATION", `end_time must be after start_time for ${entry.date}`);
    }
  }

  const propRes = await db.query(
    `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
    [propertyId, ownerId]
  );

  if (!propRes.rows.length) {
    throwError("FORBIDDEN", "You do not own this property");
  }

  const splitIntoChunks = (startTime, endTime) => {
    const chunks = [];
    let [h, m] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const endMinutes = endH * 60 + endM;

    while (h * 60 + m + 30 <= endMinutes) {
      const start = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      m += 30;
      if (m >= 60) {
        h++;
        m -= 60;
      }
      const end = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      chunks.push([start, end]);
    }
    return chunks;
  };

  const slots = [];
  for (const entry of entries) {
    const chunks = splitIntoChunks(entry.start_time, entry.end_time);

    if (!chunks.length) {
      throwError("VALIDATION", `Window too short to fit a 30-min slot on ${entry.date}`);
    }

    for (const [start, end] of chunks) {
      slots.push([propertyId, ownerId, entry.date, start, end]);
    }
  }

  const result = await db.query(
    `
    INSERT INTO property_slots (property_id, owner_id, slot_date, start_time, end_time)
    SELECT * FROM UNNEST($1::int[], $2::int[], $3::date[], $4::time[], $5::time[])
    ON CONFLICT (property_id, slot_date, start_time) DO NOTHING
    RETURNING *
    `,
    [
      slots.map((s) => s[0]),
      slots.map((s) => s[1]),
      slots.map((s) => s[2]),
      slots.map((s) => s[3]),
      slots.map((s) => s[4]),
    ]
  );

  return result.rows;
};

/*
======================================================
GET AVAILABLE SLOTS (public)
======================================================
*/

const getAvailableSlots = async (propertyId, date) => {
  if (!date) {
    throwError("VALIDATION", "date query param is required");
  }

  const result = await db.query(
    `
    SELECT id, slot_date, start_time, end_time
    FROM property_slots
    WHERE property_id = $1
      AND slot_date = $2
      AND status = 'available'
    ORDER BY start_time ASC
    `,
    [propertyId, date]
  );

  return result.rows;
};

/*
======================================================
BOOK SLOT (race-safe via row lock)
======================================================
*/

const bookSlot = async (tenantId, slotId) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    const slotRes = await client.query(
      `SELECT * FROM property_slots WHERE id = $1 FOR UPDATE`,
      [slotId]
    );

    if (!slotRes.rows.length) {
      throwError("NOT_FOUND", "Slot not found");
    }

    const slot = slotRes.rows[0];

    if (slot.status !== "available") {
      throwError("CONFLICT", "This slot is no longer available");
    }

    const result = await client.query(
      `
      UPDATE property_slots
      SET status = 'booked', booked_by = $1, booked_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [tenantId, slotId]
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  generateSlots,
  getAvailableSlots,
  bookSlot,
};