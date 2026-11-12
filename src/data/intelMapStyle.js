// Intel-style dark basemap, adapted from ingress-banner-atlas src/data/intelMapStyle.js
// (MapLibre style spec, OpenFreeMap vector tiles, no API key required).
const MAP_LABEL_LAYERS = ["water-labels", "place-labels"];
const MAP_LABEL_SOURCE = "openmaptiles-labels";

function mapPlaceName(language = "zh") {
  const fields = language === "en"
    ? ["name:en", "name_en", "name:latin", "name"]
    : ["name:zh-Hans", "name:zh", "name:zh-Hant", "name", "name:latin", "name:en", "name_en"];
  return [
    "case",
    ...fields.flatMap((field) => [
      ["!=", ["coalesce", ["get", field], ""], ""],
      ["to-string", ["get", field]],
    ]),
    "",
  ];
}

const roadWidth = [
  "interpolate",
  ["exponential", 1.35],
  ["zoom"],
  4, 0.15,
  8, 0.7,
  13, 2.2,
  18, 12,
];

const basemapSource = {
  type: "vector",
  url: "https://tiles.openfreemap.org/planet",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
};

export const intelMapStyle = {
  version: 8,
  name: "Intel Map",
  sources: {
    openmaptiles: basemapSource,
    [MAP_LABEL_SOURCE]: { ...basemapSource },
  },
  layers: [
    { id: "land", type: "background", paint: { "background-color": "#14212e" } },
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-color": [
          "match", ["get", "class"],
          "wood", "#1b2c3a",
          "grass", "#1d3040",
          "wetland", "#1b2d3a",
          "ice", "#49657a",
          "sand", "#343f4e",
          "#1a2735",
        ],
        "fill-opacity": 0.72,
      },
    },
    {
      id: "landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: {
        "fill-color": [
          "match", ["get", "class"],
          "residential", "#1a2a3b",
          "cemetery", "#1c2c3b",
          "hospital", "#222e3f",
          "school", "#202f40",
          "#192a3b",
        ],
        "fill-opacity": 0.64,
      },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "#1e3550", "fill-opacity": 0.82 },
    },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#274f70" } },
    {
      id: "waterways",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#4a86ad",
        "line-opacity": 0.92,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.35, 13, 1.4, 18, 5],
      },
    },
    {
      id: "aeroway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 9,
      paint: { "line-color": "#4f6f92", "line-opacity": 0.72, "line-width": roadWidth },
    },
    {
      id: "road-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["match", ["get", "class"],
        ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0b1723",
        "line-opacity": 0.86,
        "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 4, 1.55, 8, 2.1, 13, 3.6, 18, 13.4],
      },
    },
    {
      id: "roads",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["match", ["get", "class"],
        ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"], true, false],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match", ["get", "class"],
          ["motorway", "trunk"], "#6d8fae",
          ["primary", "secondary"], "#4f7296",
          "#3a5570",
        ],
        "line-opacity": 0.82,
        "line-width": roadWidth,
      },
    },
    {
      id: "rail",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 8,
      filter: ["==", ["get", "class"], "rail"],
      paint: { "line-color": "#4f6f92", "line-dasharray": [2, 2], "line-opacity": 0.65, "line-width": 0.8 },
    },
    {
      id: "buildings",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: { "fill-color": "#2b3f52", "fill-outline-color": "#3d5a72", "fill-opacity": 0.76 },
    },
    {
      id: "boundaries",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["match", ["get", "admin_level"], [2, 3, 4], true, false],
      paint: {
        "line-color": "#637b96",
        "line-dasharray": [3, 2],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.42, 7, 0.8],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.45, 8, 1.1],
      },
    },
    {
      id: "water-labels",
      type: "symbol",
      source: MAP_LABEL_SOURCE,
      "source-layer": "water_name",
      layout: {
        "text-field": mapPlaceName(),
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 13],
        "text-max-width": 7,
      },
      paint: { "text-color": "#5482a3", "text-halo-color": "rgba(20,33,46,0.88)", "text-halo-width": 1 },
    },
    {
      id: "place-labels",
      type: "symbol",
      source: MAP_LABEL_SOURCE,
      "source-layer": "place",
      minzoom: 2,
      filter: ["match", ["get", "class"],
        ["country", "state", "city", "town", "village"], true, false],
      layout: {
        "text-field": mapPlaceName(),
        "text-font": ["match", ["get", "class"], "country", ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 6, 11, 12, 14],
        "text-max-width": 8,
      },
      paint: { "text-color": "#b3c2d1", "text-halo-color": "rgba(11,23,36,0.92)", "text-halo-width": 1.2 },
    },
  ],
};
