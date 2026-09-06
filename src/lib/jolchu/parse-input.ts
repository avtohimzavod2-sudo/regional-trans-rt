// Deterministic, LLM-free classification of raw location input. This runs
// BEFORE any model call — coordinates, map links, and live-location payloads
// never need an LLM to understand, and running them through one would only
// add a hallucination risk for zero benefit.
import { isValidLatitude, isValidLongitude } from "./geo";
import type { JolchuInputTypeValue, JolchuLocationInput } from "./types";

export interface ParsedLocationInput {
  inputType: JolchuInputTypeValue;
  latitude: number | null;
  longitude: number | null;
  /** The original URL, when input was a map link. */
  url: string | null;
  /** Cleaned text to hand to geocoding/the model, when no coordinates were extractable. */
  text: string | null;
  /** Set when a coordinate-shaped input failed range validation (corrupted coordinates). */
  invalidCoordinates: boolean;
}

const COORDINATE_PATTERN = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

// e.g. "...?q=42.87,74.59", "...@42.87,74.59,17z", "/geo/74.59,42.87" (2GIS
// puts lon,lat in /geo/ paths — see TWO_GIS_LINK branch below).
const URL_LATLON_QUERY = /[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;
const URL_LATLON_AT = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;
const TWO_GIS_GEO_PATH = /\/geo\/(?:[^/]*\/)?(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/;

const GOOGLE_MAPS_HOST = /(maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|google\.[a-z.]+\/maps)/i;
const TWO_GIS_HOST = /(2gis\.[a-z.]+|go\.2gis\.com)/i;

const LANDMARK_MARKERS = [
  "возле",
  "напротив",
  "рядом с",
  "около",
  "после",
  "не доезжая",
  "на повороте",
  "на трассе",
  "жанында",
  "маңдайында",
  "чыгыш жагында",
  "боюнда",
];

const SETTLEMENT_ONLY_MARKERS = ["село", "деревня", "айыл", "поселок", "посёлок", "village"];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function extractGoogleMapsCoords(url: string): { latitude: number; longitude: number } | null {
  const q = url.match(URL_LATLON_QUERY);
  if (q) return { latitude: Number(q[1]), longitude: Number(q[2]) };
  const at = url.match(URL_LATLON_AT);
  if (at) return { latitude: Number(at[1]), longitude: Number(at[2]) };
  return null;
}

function extractTwoGisCoords(url: string): { latitude: number; longitude: number } | null {
  // 2GIS /geo/ paths are lon,lat (opposite order from Google's lat,lon).
  const geo = url.match(TWO_GIS_GEO_PATH);
  if (geo) return { latitude: Number(geo[2]), longitude: Number(geo[1]) };
  const q = url.match(URL_LATLON_QUERY);
  if (q) return { latitude: Number(q[1]), longitude: Number(q[2]) };
  return null;
}

/** Handles Telegram/WhatsApp live-location payloads — never text-parsed. */
export function parseLocationPayload(payload: {
  latitude: number;
  longitude: number;
  isLivePayload?: boolean;
}): ParsedLocationInput {
  const valid = isValidLatitude(payload.latitude) && isValidLongitude(payload.longitude);
  return {
    inputType: "LIVE_LOCATION",
    latitude: valid ? payload.latitude : null,
    longitude: valid ? payload.longitude : null,
    url: null,
    text: null,
    invalidCoordinates: !valid,
  };
}

export function parseLocationText(raw: string): ParsedLocationInput {
  const trimmed = raw.trim();
  const normalized = normalize(trimmed);

  const coordMatch = trimmed.match(COORDINATE_PATTERN);
  if (coordMatch) {
    const latitude = Number(coordMatch[1]);
    const longitude = Number(coordMatch[2]);
    const valid = isValidLatitude(latitude) && isValidLongitude(longitude);
    return {
      inputType: "COORDINATES",
      latitude: valid ? latitude : null,
      longitude: valid ? longitude : null,
      url: null,
      text: null,
      invalidCoordinates: !valid,
    };
  }

  if (GOOGLE_MAPS_HOST.test(trimmed)) {
    const coords = extractGoogleMapsCoords(trimmed);
    return {
      inputType: "GOOGLE_MAPS_LINK",
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      url: trimmed,
      text: coords ? null : trimmed,
      invalidCoordinates: false,
    };
  }

  if (TWO_GIS_HOST.test(trimmed)) {
    const coords = extractTwoGisCoords(trimmed);
    return {
      inputType: "TWO_GIS_LINK",
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      url: trimmed,
      text: coords ? null : trimmed,
      invalidCoordinates: false,
    };
  }

  if (SETTLEMENT_ONLY_MARKERS.some((m) => normalized.includes(m)) && !/\d/.test(normalized)) {
    return {
      inputType: "SETTLEMENT_ONLY",
      latitude: null,
      longitude: null,
      url: null,
      text: trimmed,
      invalidCoordinates: false,
    };
  }

  if (LANDMARK_MARKERS.some((m) => normalized.includes(m))) {
    return {
      inputType: "LANDMARK",
      latitude: null,
      longitude: null,
      url: null,
      text: trimmed,
      invalidCoordinates: false,
    };
  }

  if (trimmed.length === 0) {
    return { inputType: "UNKNOWN", latitude: null, longitude: null, url: null, text: null, invalidCoordinates: false };
  }

  return {
    inputType: "TEXT_ADDRESS",
    latitude: null,
    longitude: null,
    url: null,
    text: trimmed,
    invalidCoordinates: false,
  };
}

export function parseLocationInput(input: JolchuLocationInput): ParsedLocationInput {
  if (typeof input === "string") return parseLocationText(input);
  return parseLocationPayload(input);
}
