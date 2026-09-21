const { Client } = require("@googlemaps/google-maps-services-js");

const client = new Client({});

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const getLocationFromEircode = async (eirCode) => {
  if (!eirCode) {
    throw {
      type: "VALIDATION",
      message: "EIR code is required",
    };
  }

  if (!GOOGLE_API_KEY) {
    throw {
      type: "LOCATION_ERROR",
      message: "Google Maps API key is not configured",
    };
  }

  try {
    const response = await client.geocode({
      params: {
        address: `${eirCode}, Ireland`,
        key: GOOGLE_API_KEY,
      },
    });

    const results = response.data.results;

    if (!results.length) {
      throw {
        type: "LOCATION_ERROR",
        message: "Invalid EIR code or location not found",
      };
    }

    const result = results[0];

    const latitude = result.geometry.location.lat;
    const longitude = result.geometry.location.lng;

    let city = null;
    let county = null;
    let locality = null;

    for (const component of result.address_components) {

      const types = component.types;

      if (
        types.includes("locality") &&
        !city
      ) {
        city = component.long_name;
      }

      if (
        types.includes("administrative_area_level_1") &&
        !county
      ) {
        county = component.long_name;
      }

      if (
        types.includes("postal_town") &&
        !locality
      ) {
        locality = component.long_name;
      }

      if (
        types.includes("sublocality") &&
        !locality
      ) {
        locality = component.long_name;
      }
    }

    if (latitude == null || longitude == null) {
      throw {
        type: "LOCATION_ERROR",
        message: "Unable to determine coordinates for this EIR code",
      };
    }

    return {
      latitude,
      longitude,
      city,
      county,
      locality,
    };

  } catch (err) {

    if (
      err.type === "VALIDATION" ||
      err.type === "LOCATION_ERROR"
    ) {
      throw err;
    }

    console.error(
      "Location service error:",
      err.response?.data || err.message
    );

    throw {
      type: "LOCATION_ERROR",
      message: "Unable to fetch location details for the EIR code",
    };
  }
};

module.exports = {
  getLocationFromEircode,
};