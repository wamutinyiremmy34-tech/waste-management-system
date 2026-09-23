// Leaflet mock for Jest — the real Leaflet requires a DOM environment with
// canvas support that jsdom doesn't provide. Since OperationalMap loads
// Leaflet via dynamic import inside useEffect (client-only), it never
// executes during tests. This mock prevents "Cannot find module" errors
// if leaflet isn't installed in the local node_modules.
const L = {
  map: jest.fn(() => ({
    setView: jest.fn().mockReturnThis(),
    remove: jest.fn(),
  })),
  tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
  circle: jest.fn(() => ({ bindPopup: jest.fn().mockReturnThis(), addTo: jest.fn() })),
  marker: jest.fn(() => ({ bindPopup: jest.fn().mockReturnThis(), addTo: jest.fn() })),
  divIcon: jest.fn(),
  geoJSON: jest.fn(() => ({ addTo: jest.fn() })),
  Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } },
};
module.exports = L;
module.exports.default = L;
