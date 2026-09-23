/**
 * react-leaflet mock for Jest.
 * All react-leaflet components are no-ops in the test environment.
 */

const noop = () => null;

export const MapContainer = noop;
export const TileLayer = noop;
export const Marker = noop;
export const Popup = noop;
export const Circle = noop;
export const GeoJSON = noop;

export const useMap = () => ({});
