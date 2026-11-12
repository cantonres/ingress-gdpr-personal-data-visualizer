// Light basemap variant, same source structure as intelMapStyle so
// map.setStyle() swaps cleanly and data layers re-attach unchanged.
const basemapSource = {
  type: "vector",
  url: "https://tiles.openfreemap.org/planet",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org">OpenFreeMap</a>',
};

const roadWidth = [
  "interpolate",
  ["exponential", 1.35],
  ["zoom"],
  4, 0.3,
  8, 0.9,
  13, 2.4,
  18, 12,
];

export const lightMapStyle = {
  version: 8,
  name: "Light",
  sources: {
    openmaptiles: basemapSource,
    "openmaptiles-labels": { ...basemapSource },
  },
  layers: [
    { id: "land", type: "background", paint: { "background-color": "#f5f7fa" } },
    {
      id: "landcover",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      paint: {
        "fill-color": [
          "match", ["get", "class"],
          "wood", "#dbe4ee",
          "grass", "#e0e9f2",
          "wetland", "#dbe6ef",
          "ice", "#edf2f7",
          "sand", "#f0e9d8",
          "#e3ebf3",
        ],
        "fill-opacity": 0.9,
      },
    },
    {
      id: "landuse",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      paint: { "fill-color": "#e9edf3", "fill-opacity": 0.8 },
    },
    {
      id: "park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "#d5e2f0", "fill-opacity": 0.85 },
    },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#bcd5ec" } },
    {
      id: "waterways",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: {
        "line-color": "#99bcd8",
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.35, 13, 1.2, 18, 4],
      },
    },
    {
      id: "aeroway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "aeroway",
      minzoom: 9,
      paint: { "line-color": "#dcdcd4", "line-width": roadWidth },
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
        "line-color": "#e2e0d8",
        "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 4, 1.6, 8, 2.2, 13, 3.8, 18, 13],
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
          ["motorway", "trunk"], "#f9c76c",
          ["primary", "secondary"], "#ffffff",
          "#ffffff",
        ],
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
      paint: { "line-color": "#c9c7be", "line-dasharray": [2, 2], "line-width": 0.8 },
    },
    {
      id: "buildings",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: { "fill-color": "#e7e5dd", "fill-outline-color": "#d8d6cd", "fill-opacity": 0.9 },
    },
    {
      id: "boundaries",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["match", ["get", "admin_level"], [2, 3, 4], true, false],
      paint: {
        "line-color": "#c5c2b8",
        "line-dasharray": [3, 2],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 7, 0.9],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 8, 1.2],
      },
    },
    {
      id: "water-labels",
      type: "symbol",
      source: "openmaptiles-labels",
      "source-layer": "water_name",
      layout: {
        "text-field": ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name"], ["get", "name:latin"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 9, 13],
        "text-max-width": 7,
      },
      paint: { "text-color": "#6a93a3", "text-halo-color": "rgba(250,250,247,0.9)", "text-halo-width": 1 },
    },
    {
      id: "place-labels",
      type: "symbol",
      source: "openmaptiles-labels",
      "source-layer": "place",
      minzoom: 2,
      filter: ["match", ["get", "class"],
        ["country", "state", "city", "town", "village"], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name"], ["get", "name:latin"]],
        "text-font": ["match", ["get", "class"], "country", ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 9, 6, 11, 12, 14],
        "text-max-width": 8,
      },
      paint: { "text-color": "#5c6064", "text-halo-color": "rgba(250,250,247,0.92)", "text-halo-width": 1.2 },
    },
  ],
};
