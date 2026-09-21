const { Client } = require("@googlemaps/google-maps-services-js");
const db = require("../../db/conn");

const client = new Client({});

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error(
    "GOOGLE_MAPS_API_KEY is not set — neighbourhood auto-fetch will fail for all listings."
  );
}

/*
|--------------------------------------------------------------------------
| Google Places Categories
|--------------------------------------------------------------------------
|
| Important:
| - Luas can sometimes be returned by Google as:
|     subway_station
|     light_rail_station
|     transit_station
|
| - Bus stops can sometimes also come back as generic transit_station.
|
| Therefore, transit_station is classified separately using
| Google's `types` + place name.
|
|--------------------------------------------------------------------------
*/

const PLACE_CATEGORIES = [
  { type: "school", label: "school" },
  { type: "university", label: "college" },
  { type: "pub", label: "pub" },
  { type: "restaurant", label: "restaurant" },
  { type: "park", label: "park" },
  {
    type: "grocery_or_supermarket",
    label: "grocery_store",
  },
  { type: "hospital", label: "hospital" },
  { type: "pharmacy", label: "pharmacy" },

  // Bus → generic transit category
  { type: "bus_station", label: "transit_stop" },

  // Luas / rail
  { type: "subway_station", label: "luas_stop" },
  { type: "train_station", label: "train_station" },
  { type: "light_rail_station", label: "luas_stop" },

  { type: "church", label: "church" },
  { type: "gym", label: "gym" },
  { type: "lodging", label: "hotel" },
  { type: "bar", label: "pub" },
  { type: "night_club", label: "pub" },

  /*
   * Generic transit fallback.
   *
   * Google may return Luas, DART, Irish Rail or bus locations
   * using this generic type.
   */
  { type: "transit_station", label: "transit_stop" },
];

/*
|--------------------------------------------------------------------------
| Dublin City Centre
|--------------------------------------------------------------------------
*/

const CITY_CENTER = {
  lat: 53.3498,
  lng: -6.2603,
};

/*
|--------------------------------------------------------------------------
| Known Luas Stop Names
|--------------------------------------------------------------------------
|
| Google does not always return "light_rail_station" for Luas.
| In Ireland it can return a generic `transit_station`.
|
| Therefore we maintain a list of known Luas stop names as an
| additional classification layer.
|
|--------------------------------------------------------------------------
*/

const LUAS_STOP_NAMES = new Set([
  // Red Line
  "the point",
  "spencer dock",
  "mayor square - nua",
  "mayor square",
  "busáras",
  "busaras",
  "abbey street",
  "jervis",
  "four courts",
  "smithfield",
  "museum",
  "heuston",
  "st. james's",
  "st james's",
  "fatima",
  "rialto",
  "suir road",
  "goldenbridge",
  "bluebell",
  "blackhorse",
  "drimnagh",
  "red cow",
  "kylemore",
  "naas road",
  "belgard",
  "cookstown",
  "hospital",
  "tallaght",
  "saggart",

  // Green Line
  "broombridge",
  "phibsborough",
  "grangegorman",
  "dominick",
  "parnell",
  "marlborough",
  "o'connell upper",
  "o'connell - upper",
  "o'connell gpo",
  "marlborough",
  "abbey street",

  "st. stephen's green",
  "st stephen's green",
  "stephen's green",
  "charlemont",
  "harcourt",
  "ranelagh",
  "beechwood",
  "cowper",
  "milltown",
  "windy arbour",
  "dunville avenue",
  "balally",
  "kilmacud",
  "stillorgan",
  "sandyford",
  "central park",
  "glencairn",
  "leopardstown valley",
  "ballyogan wood",
  "carrickmines",
  "laughanstown",
  "bride's glen",
  "brides glen",
  "cherrywood",
]);

/*
|--------------------------------------------------------------------------
| Normalise Place Name
|--------------------------------------------------------------------------
*/

const normalisePlaceName = (name) => {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

/*
|--------------------------------------------------------------------------
| Check whether a place is a Luas stop
|--------------------------------------------------------------------------
*/

const isLuasStop = (place) => {
  const types = place.types || [];
  const name = normalisePlaceName(place.name);

  /*
   * Strong Google classifications
   */
  if (
    types.includes("light_rail_station") ||
    types.includes("subway_station")
  ) {
    return true;
  }

  /*
   * Explicit Luas in name
   *
   * Examples:
   * "Luas Stop"
   * "Luas"
   * "Luas - ..."
   */
  if (
    name === "luas" ||
    name.includes("luas") ||
    name.includes("luas stop")
  ) {
    return true;
  }

  /*
   * Known Luas stop name
   */
  if (LUAS_STOP_NAMES.has(name)) {
    return true;
  }

  return false;
};

/*
|--------------------------------------------------------------------------
| Check whether a place is a train / DART station
|--------------------------------------------------------------------------
*/

const isTrainStation = (place) => {
  const types = place.types || [];
  const name = normalisePlaceName(place.name);

  /*
   * Strong Google classification
   */
  if (types.includes("train_station")) {
    return true;
  }

  /*
   * DART / Irish Rail / railway naming
   */
  if (
    name.includes("dart station") ||
    name.includes("dart") ||
    name.includes("irish rail") ||
    name.includes("railway station") ||
    name.includes("rail station") ||
    name.includes("train station")
  ) {
    return true;
  }

  return false;
};

/*
|--------------------------------------------------------------------------
| Check whether a place is a bus stop
|--------------------------------------------------------------------------
*/

const isBusStop = (place) => {
  const types = place.types || [];
  const name = normalisePlaceName(place.name);

  if (types.includes("bus_station")) {
    return true;
  }

  if (
    name.includes("bus stop") ||
    name.includes("bus station") ||
    name.startsWith("busáras") ||
    name.startsWith("busaras")
  ) {
    return true;
  }

  return false;
};

/*
|--------------------------------------------------------------------------
| Classify Generic Transit Stop
|--------------------------------------------------------------------------
|
| Google sometimes gives:
|
|     types: ["transit_station"]
|
| for:
|
|     Luas
|     DART
|     Irish Rail
|     Bus
|
| We therefore classify it ourselves.
|
|--------------------------------------------------------------------------
*/

const classifyTransitStop = (place) => {
  /*
   * Priority 1:
   * Luas
   */
  if (isLuasStop(place)) {
    return "luas_stop";
  }

  /*
   * Priority 2:
   * Train / DART
   */
  if (isTrainStation(place)) {
    return "train_station";
  }

  /*
   * Priority 3:
   * Bus
   *
   * We intentionally return transit_stop here.
   *
   * This means the UI will show:
   *
   *     Other Transit Stops
   *
   * instead of:
   *
   *     Bus Stops
   */
  if (isBusStop(place)) {
    return "transit_stop";
  }

  /*
   * Anything Google cannot confidently classify
   */
  return "transit_stop";
};

/*
|--------------------------------------------------------------------------
| Step 1:
| Eircode → Latitude / Longitude
|--------------------------------------------------------------------------
*/

const getCoordinatesFromEircode = async (eircode) => {
  const response = await client.geocode({
    params: {
      address: `${eircode}, Ireland`,
      key: GOOGLE_API_KEY,
    },
  });

  if (!response.data.results.length) {
    throw {
      type: "VALIDATION",
      message: "Invalid EIR code or location not found",
    };
  }

  const location = response.data.results[0].geometry.location;

  return {
    lat: location.lat,
    lng: location.lng,
  };
};

/*
|--------------------------------------------------------------------------
| Step 2:
| Latitude / Longitude → Nearby Places
|--------------------------------------------------------------------------
*/

const fetchNearbyPlaces = async (
  lat,
  lng,
  placeType,
  label
) => {
  try {
    const response = await client.placesNearby({
      params: {
        location: {
          lat,
          lng,
        },
        radius: 2000,
        type: placeType,
        key: GOOGLE_API_KEY,
      },
    });

    /*
     * Google can return HTTP 200 with an API status such as:
     *
     * REQUEST_DENIED
     * OVER_QUERY_LIMIT
     * INVALID_REQUEST
     * ZERO_RESULTS
     */

    if (
      response.data.status !== "OK" &&
      response.data.status !== "ZERO_RESULTS"
    ) {
      console.error(
        `Places API returned status ${response.data.status} for type "${placeType}":`,
        response.data.error_message || "(no error_message)"
      );

      return [];
    }

    const results = (response.data.results || []).slice(0, 5);

    return results.map((place) => {
      const distance = getDistanceInMeters(
        lat,
        lng,
        place.geometry.location.lat,
        place.geometry.location.lng
      );

      /*
       * If Google gave us generic transit_station,
       * classify it ourselves.
       *
       * For explicit categories we trust our configured label.
       */
      let placeTypeLabel = label;

      if (
        placeType === "transit_station" ||
        placeType === "bus_station"
      ) {
        placeTypeLabel = classifyTransitStop(place);
      }

      return {
        place_id: place.place_id,

        place_type: placeTypeLabel,

        name: place.name,

        distance_meters: Math.round(distance),
      };
    });
  } catch (err) {
    console.error(
      `Failed to fetch places for type ${placeType}:`,
      err.message
    );

    return [];
  }
};
/*
|--------------------------------------------------------------------------
| Step 3:
| Distance to Dublin City Centre
|--------------------------------------------------------------------------
*/

const getDistanceToCityCenter = (lat, lng) => {
  const distance = getDistanceInMeters(
    lat,
    lng,
    CITY_CENTER.lat,
    CITY_CENTER.lng
  );

  return {
    place_type: "city_center",
    name: "Dublin City Center",
    distance_meters: Math.round(distance),
  };
};

/*
|--------------------------------------------------------------------------
| Haversine Distance
|--------------------------------------------------------------------------
*/

const getDistanceInMeters = (
  lat1,
  lng1,
  lat2,
  lng2
) => {
  const R = 6371000;

  const rad = Math.PI / 180;

  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
};

/*
|--------------------------------------------------------------------------
| Step 4:
| Save Neighbourhood Data
|--------------------------------------------------------------------------
*/

const saveNeighbourhoodData = async (
  propertyId,
  places
) => {
  if (!places.length) {
    return;
  }

  const values = places
    .map(
      (_, i) =>
        `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`
    )
    .join(", ");

  const params = [propertyId];

  places.forEach((place) => {
    params.push(
      place.place_type,
      place.name,
      place.distance_meters
    );
  });

  await db.query(
    `
      INSERT INTO property_neighbourhood
      (
        property_id,
        place_type,
        name,
        distance_meters
      )
      VALUES ${values}
    `,
    params
  );
};

/*
|--------------------------------------------------------------------------
| Main:
| Fetch + Save Neighbourhood Data
|--------------------------------------------------------------------------
*/

const fetchAndSaveNeighbourhood = async (
  propertyId,
  lat,
  lng
) => {
  try {
    if (lat == null || lng == null) {
      throw new Error(
        "Latitude and longitude are required"
      );
    }

    const allPlaces = [];

    /*
     * Fetch every configured category
     */
    for (const category of PLACE_CATEGORIES) {
      const places = await fetchNearbyPlaces(
        lat,
        lng,
        category.type,
        category.label
      );

      allPlaces.push(...places);
    }

    /*
     * Add Dublin City Centre
     */
    const cityCenter =
      getDistanceToCityCenter(lat, lng);

    allPlaces.push(cityCenter);

    /*
     |--------------------------------------------------------------------------
     | DEDUPLICATION
     |--------------------------------------------------------------------------
     |
     | Same Google place can appear under multiple categories.
     |
     | Example:
     *
     * Leopardstown Valley
     *
     * may appear from:
     *
     * light_rail_station
     * transit_station
     *
     * We use Google place_id wherever available.
     */
    const seen = new Set();

    const dedupedPlaces = allPlaces.filter(
      (place) => {
        const key =
          place.place_id ||
          `${place.place_type}:${place.name}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );

    /*
     * Save to DB
     */
    await saveNeighbourhoodData(
      propertyId,
      dedupedPlaces
    );

    console.log(
      `Neighbourhood data saved for property ${propertyId}`
    );
  } catch (err) {
    console.error(
      "Neighbourhood fetch error:",
      err.response?.data || err.message
    );
  }
};

/*
|--------------------------------------------------------------------------
| Preview Version
|--------------------------------------------------------------------------
|
| Same logic as fetchAndSaveNeighbourhood,
| but does NOT save anything to DB.
|--------------------------------------------------------------------------
*/

const previewNeighbourhood = async (
  eircode
) => {
  if (!eircode) {
    throw {
      type: "VALIDATION",
      message: "EIR code is required",
    };
  }

  const {
    lat,
    lng,
  } = await getCoordinatesFromEircode(
    eircode
  );

  const allPlaces = [];

  /*
   * Fetch categories
   */
  for (const category of PLACE_CATEGORIES) {
    const places = await fetchNearbyPlaces(
      lat,
      lng,
      category.type,
      category.label
    );

    allPlaces.push(...places);
  }

  /*
   * Add city centre
   */
  const cityCenter =
    getDistanceToCityCenter(lat, lng);

  allPlaces.push(cityCenter);

  /*
   * Deduplicate
   */
  const seen = new Set();

  const dedupedPlaces =
    allPlaces.filter((place) => {
      const key =
        place.place_id ||
        `${place.place_type}:${place.name}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });

  return {
    lat,
    lng,
    places: dedupedPlaces,
  };
};

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  fetchAndSaveNeighbourhood,
  getCoordinatesFromEircode,
  previewNeighbourhood,
};
