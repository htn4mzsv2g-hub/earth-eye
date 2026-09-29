/**
 * Earth Eye: a small bundled table of major airports (IATA code → position) so
 * "take me to LAX" works offline and without a geocoder. Coordinates are public
 * aerodrome reference points rounded to ~100 m. Not for navigation.
 */
export const AIRPORTS = Object.freeze({
  ATL: ['Hartsfield–Jackson Atlanta', 33.6407, -84.4277],
  AUS: ['Austin–Bergstrom', 30.1975, -97.6664],
  BOS: ['Boston Logan', 42.3656, -71.0096],
  BWI: ['Baltimore/Washington', 39.1774, -76.6684],
  CDG: ['Paris Charles de Gaulle', 49.0097, 2.5479],
  CLT: ['Charlotte Douglas', 35.214, -80.9431],
  DCA: ['Washington National', 38.8512, -77.0402],
  DEN: ['Denver', 39.8561, -104.6737],
  DFW: ['Dallas/Fort Worth', 32.8998, -97.0403],
  DOH: ['Doha Hamad', 25.2731, 51.6081],
  DTW: ['Detroit Metro', 42.2162, -83.3554],
  DXB: ['Dubai International', 25.2532, 55.3657],
  EWR: ['Newark Liberty', 40.6895, -74.1745],
  FRA: ['Frankfurt', 50.0379, 8.5622],
  HKG: ['Hong Kong', 22.308, 113.9185],
  HND: ['Tokyo Haneda', 35.5494, 139.7798],
  HNL: ['Honolulu', 21.3187, -157.9225],
  IAD: ['Washington Dulles', 38.9531, -77.4565],
  IAH: ['Houston Bush', 29.9902, -95.3368],
  ICN: ['Seoul Incheon', 37.4602, 126.4407],
  IST: ['Istanbul', 41.2753, 28.7519],
  JFK: ['New York JFK', 40.6413, -73.7781],
  LAS: ['Las Vegas Harry Reid', 36.084, -115.1537],
  LAX: ['Los Angeles International', 33.9416, -118.4085],
  LGA: ['New York LaGuardia', 40.7769, -73.874],
  LHR: ['London Heathrow', 51.47, -0.4543],
  MAD: ['Madrid Barajas', 40.4983, -3.5676],
  MCO: ['Orlando', 28.4312, -81.3081],
  MIA: ['Miami', 25.7959, -80.287],
  MSP: ['Minneapolis–St Paul', 44.8848, -93.2223],
  NRT: ['Tokyo Narita', 35.772, 140.3929],
  OAK: ['Oakland', 37.7126, -122.2197],
  ORD: ["Chicago O'Hare", 41.9742, -87.9073],
  MDW: ['Chicago Midway', 41.7868, -87.7522],
  PDX: ['Portland', 45.5898, -122.5951],
  PHL: ['Philadelphia', 39.8744, -75.2424],
  PHX: ['Phoenix Sky Harbor', 33.4352, -112.0101],
  SAN: ['San Diego', 32.7338, -117.1933],
  SAT: ['San Antonio', 29.5337, -98.4698],
  SEA: ['Seattle–Tacoma', 47.4502, -122.3088],
  SFO: ['San Francisco International', 37.6213, -122.379],
  SIN: ['Singapore Changi', 1.3644, 103.9915],
  SJC: ['San Jose', 37.3639, -121.9289],
  SLC: ['Salt Lake City', 40.7899, -111.9791],
  SYD: ['Sydney Kingsford Smith', -33.9399, 151.1753],
  YYZ: ['Toronto Pearson', 43.6777, -79.6248],
  HOU: ['Houston Hobby', 29.6454, -95.2789],
  BNA: ['Nashville', 36.1263, -86.6774],
  MEX: ['Mexico City', 19.4361, -99.0719],
  AMS: ['Amsterdam Schiphol', 52.3105, 4.7683],
});

/** Look up an airport by IATA code (case-insensitive). */
export function findAirport(code) {
  const key = String(code || '')
    .trim()
    .toUpperCase();
  const row = AIRPORTS[key];
  return row ? { code: key, name: row[0], lat: row[1], lon: row[2] } : null;
}
