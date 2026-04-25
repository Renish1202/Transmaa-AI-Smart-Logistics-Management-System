import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const INDIA_CENTER = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;
const START_COLOR = "#16a34a";
const END_COLOR = "#dc2626";
const ROUTE_PLAN_COLOR = "#38bdf8";
const REMAINING_ROUTE_COLOR = "#f59e0b";
const ROUTING_ENDPOINT = "https://router.project-osrm.org/route/v1/driving";
const NAVIGATION_STATUSES = new Set(["started", "in_transit", "delivered"]);

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const STATUS_META = {
  started: { color: "#0ea5e9", label: "Started" },
  in_transit: { color: "#059669", label: "In Transit" },
  delivered: { color: "#7c3aed", label: "Delivered" },
  completed: { color: "#16a34a", label: "Completed" },
  accepted: { color: "#2563eb", label: "Accepted" },
  unknown: { color: "#f59e0b", label: "Other" },
};

const statusMeta = (status) => STATUS_META[status] || STATUS_META.unknown;

const sanitizeRoutePath = (routePath) => {
  if (!Array.isArray(routePath)) return [];

  return routePath
    .map((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        const lat = Number(entry[0]);
        const lng = Number(entry[1]);
        if (isNumber(lat) && isNumber(lng)) return { lat, lng };
        return null;
      }
      if (entry && typeof entry === "object") {
        const lat = Number(entry.lat);
        const lng = Number(entry.lng);
        if (isNumber(lat) && isNumber(lng)) return { lat, lng };
      }
      return null;
    })
    .filter(Boolean);
};

const buildRouteKey = (originLat, originLng, destinationLat, destinationLng) =>
  `${originLat.toFixed(4)},${originLng.toFixed(4)}->${destinationLat.toFixed(4)},${destinationLng.toFixed(4)}`;

const fetchRoadRoute = async (originLat, originLng, destinationLat, destinationLng) => {
  const url = `${ROUTING_ENDPOINT}/${originLng},${originLat};${destinationLng},${destinationLat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const payload = await response.json();
  const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];

  const route = coordinates
    .map((coords) => {
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!isNumber(lat) || !isNumber(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);

  return route;
};

export default function LiveTrackingMap({ points = [], heightClass = "h-[460px]" }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const baseLayersRef = useRef({});
  const activeBaseLayerRef = useRef(null);
  const satelliteLabelsRef = useRef(null);
  const routeCacheRef = useRef(new Map());
  const inFlightRouteRef = useRef(new Set());
  const [followLive, setFollowLive] = useState(true);
  const [manualRecenterCount, setManualRecenterCount] = useState(0);
  const [mapStyle, setMapStyle] = useState("satellite");
  const [plannedRouteByRide, setPlannedRouteByRide] = useState({});
  const [remainingRouteByRide, setRemainingRouteByRide] = useState({});
  const truckMarkerIcon = useMemo(
    () =>
      L.icon({
        iconUrl: "/truck-marker.svg",
        iconSize: [36, 36],
        iconAnchor: [18, 34],
        popupAnchor: [0, -30],
        tooltipAnchor: [0, -26],
      }),
    []
  );

  const ridePoints = useMemo(() => points.filter(Boolean), [points]);
  const validPoints = useMemo(
    () =>
      ridePoints.filter((point) => isNumber(point?.lat) && isNumber(point?.lng)),
    [ridePoints]
  );
  const totalPathPoints = useMemo(
    () =>
      ridePoints.reduce((sum, point) => {
        const pathPoints = Array.isArray(point.path) ? point.path.length : 0;
        return sum + pathPoints;
      }, 0),
    [ridePoints]
  );

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      center: INDIA_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    baseLayersRef.current = {
      street: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
      }),
      terrain: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        subdomains: "abc",
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
        maxZoom: 17,
      }),
      satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          maxZoom: 20,
        }
      ),
    };

    satelliteLabelsRef.current = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Labels &copy; Esri",
        maxZoom: 20,
      }
    );

    activeBaseLayerRef.current = baseLayersRef.current[mapStyle] || baseLayersRef.current.satellite;
    activeBaseLayerRef.current.addTo(map);
    if (mapStyle === "satellite" && satelliteLabelsRef.current) {
      satelliteLabelsRef.current.addTo(map);
    }

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      baseLayersRef.current = {};
      activeBaseLayerRef.current = null;
      satelliteLabelsRef.current = null;
      routeCacheRef.current.clear();
      inFlightRouteRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextLayer = baseLayersRef.current[mapStyle];
    if (!nextLayer) return;

    if (activeBaseLayerRef.current && map.hasLayer(activeBaseLayerRef.current)) {
      map.removeLayer(activeBaseLayerRef.current);
    }
    nextLayer.addTo(map);
    activeBaseLayerRef.current = nextLayer;

    if (satelliteLabelsRef.current) {
      if (mapStyle === "satellite") {
        satelliteLabelsRef.current.addTo(map);
      } else if (map.hasLayer(satelliteLabelsRef.current)) {
        map.removeLayer(satelliteLabelsRef.current);
      }
    }
  }, [mapStyle]);

  useEffect(() => {
    const activeRideIds = new Set(ridePoints.map((point) => String(point.ride_id)));

    setPlannedRouteByRide((prev) => {
      const next = {};
      Object.entries(prev).forEach(([rideId, route]) => {
        if (activeRideIds.has(rideId)) next[rideId] = route;
      });
      return next;
    });

    setRemainingRouteByRide((prev) => {
      const next = {};
      Object.entries(prev).forEach(([rideId, route]) => {
        if (activeRideIds.has(rideId)) next[rideId] = route;
      });
      return next;
    });

    if (ridePoints.length === 0) {
      return;
    }

    let cancelled = false;
    const plannedFromPayload = {};
    const jobs = [];

    ridePoints.forEach((point) => {
      const rideId = point?.ride_id;
      if (rideId == null) return;
      const rideIdKey = String(rideId);

      const hasStart = isNumber(point.start_lat) && isNumber(point.start_lng);
      const hasEnd = isNumber(point.end_lat) && isNumber(point.end_lng);
      const hasDriver = isNumber(point.lat) && isNumber(point.lng);

      const payloadRoutePath = sanitizeRoutePath(point.route_path);
      if (payloadRoutePath.length > 1) {
        plannedFromPayload[rideIdKey] = payloadRoutePath;
      } else if (hasStart && hasEnd) {
        jobs.push({
          kind: "planned",
          rideIdKey,
          key: buildRouteKey(point.start_lat, point.start_lng, point.end_lat, point.end_lng),
          originLat: point.start_lat,
          originLng: point.start_lng,
          destinationLat: point.end_lat,
          destinationLng: point.end_lng,
        });
      }

      if (hasDriver && hasEnd && NAVIGATION_STATUSES.has(point.status)) {
        jobs.push({
          kind: "remaining",
          rideIdKey,
          key: buildRouteKey(point.lat, point.lng, point.end_lat, point.end_lng),
          originLat: point.lat,
          originLng: point.lng,
          destinationLat: point.end_lat,
          destinationLng: point.end_lng,
        });
      }
    });

    if (Object.keys(plannedFromPayload).length > 0) {
      setPlannedRouteByRide((prev) => ({ ...prev, ...plannedFromPayload }));
    }

    const run = async () => {
      await Promise.all(
        jobs.map(async (job) => {
          const cacheKey = `${job.kind}:${job.key}`;
          const cachedRoute = routeCacheRef.current.get(cacheKey);
          if (cachedRoute) {
            if (cancelled) return;
            if (job.kind === "planned") {
              setPlannedRouteByRide((prev) => ({ ...prev, [job.rideIdKey]: cachedRoute }));
            } else {
              setRemainingRouteByRide((prev) => ({ ...prev, [job.rideIdKey]: cachedRoute }));
            }
            return;
          }

          if (inFlightRouteRef.current.has(cacheKey)) return;
          inFlightRouteRef.current.add(cacheKey);

          try {
            const route = await fetchRoadRoute(
              job.originLat,
              job.originLng,
              job.destinationLat,
              job.destinationLng
            );
            if (cancelled || route.length < 2) return;

            routeCacheRef.current.set(cacheKey, route);
            if (job.kind === "planned") {
              setPlannedRouteByRide((prev) => ({ ...prev, [job.rideIdKey]: route }));
            } else {
              setRemainingRouteByRide((prev) => ({ ...prev, [job.rideIdKey]: route }));
            }
          } catch {
            // Best effort; map will still render GPS path and markers without route geometry.
          } finally {
            inFlightRouteRef.current.delete(cacheKey);
          }
        })
      );
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [ridePoints]);

  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current) return;

    markerLayerRef.current.clearLayers();

    if (ridePoints.length === 0) {
      mapRef.current.setView(INDIA_CENTER, DEFAULT_ZOOM);
      return;
    }

    const bounds = L.latLngBounds([]);

    ridePoints.forEach((point) => {
      const { color } = statusMeta(point.status);
      const rideIdKey = String(point.ride_id ?? "");
      const hasStart = isNumber(point.start_lat) && isNumber(point.start_lng);
      const hasEnd = isNumber(point.end_lat) && isNumber(point.end_lng);
      const hasDriver = isNumber(point.lat) && isNumber(point.lng);

      const plannedRoute = plannedRouteByRide[rideIdKey] || sanitizeRoutePath(point.route_path);
      if (plannedRoute.length > 1) {
        const plannedLatLng = plannedRoute.map((entry) => [entry.lat, entry.lng]);
        plannedLatLng.forEach((coords) => bounds.extend(coords));
        L.polyline(plannedLatLng, {
          color: ROUTE_PLAN_COLOR,
          weight: 3,
          opacity: 0.8,
          dashArray: "8 6",
          lineJoin: "round",
          lineCap: "round",
        }).addTo(markerLayerRef.current);
      } else if (hasStart && hasEnd) {
        L.polyline(
          [
            [point.start_lat, point.start_lng],
            [point.end_lat, point.end_lng],
          ],
          {
            color: ROUTE_PLAN_COLOR,
            weight: 2,
            opacity: 0.35,
            dashArray: "6 6",
            lineJoin: "round",
            lineCap: "round",
          }
        ).addTo(markerLayerRef.current);
      }

      if (hasStart) {
        const startMarker = L.circleMarker([point.start_lat, point.start_lng], {
          radius: 8,
          color: START_COLOR,
          fillColor: START_COLOR,
          fillOpacity: 0.95,
          weight: 2,
        });
        startMarker.bindTooltip(`Start \u2022 ${point.label || `Ride #${point.ride_id || "-"}`}`, {
          direction: "top",
          offset: [0, -8],
        });
        startMarker.bindPopup(
          `<strong>Start Point</strong><br/>${point.label || `Ride #${point.ride_id || "-"}`}<br/>${point.subtitle || ""}`
        );
        startMarker.addTo(markerLayerRef.current);
        bounds.extend([point.start_lat, point.start_lng]);
      }

      if (hasEnd) {
        const endMarker = L.circleMarker([point.end_lat, point.end_lng], {
          radius: 8,
          color: END_COLOR,
          fillColor: END_COLOR,
          fillOpacity: 0.95,
          weight: 2,
        });
        endMarker.bindTooltip(`End \u2022 ${point.label || `Ride #${point.ride_id || "-"}`}`, {
          direction: "top",
          offset: [0, -8],
        });
        endMarker.bindPopup(
          `<strong>End Point</strong><br/>${point.label || `Ride #${point.ride_id || "-"}`}<br/>${point.subtitle || ""}`
        );
        endMarker.addTo(markerLayerRef.current);
        bounds.extend([point.end_lat, point.end_lng]);
      }

      const pathPoints = Array.isArray(point.path)
        ? point.path.filter((entry) => isNumber(entry?.lat) && isNumber(entry?.lng))
        : [];

      if (pathPoints.length > 1) {
        const latLngPath = pathPoints.map((entry) => [entry.lat, entry.lng]);
        latLngPath.forEach((coords) => bounds.extend(coords));
        L.polyline(latLngPath, {
          color,
          weight: 4,
          opacity: 0.55,
          lineJoin: "round",
          lineCap: "round",
        }).addTo(markerLayerRef.current);
      }

      const remainingRoute = remainingRouteByRide[rideIdKey];
      if (remainingRoute && remainingRoute.length > 1) {
        const remainingLatLng = remainingRoute.map((entry) => [entry.lat, entry.lng]);
        remainingLatLng.forEach((coords) => bounds.extend(coords));
        L.polyline(remainingLatLng, {
          color: REMAINING_ROUTE_COLOR,
          weight: 4,
          opacity: 0.8,
          dashArray: "10 6",
          lineJoin: "round",
          lineCap: "round",
        }).addTo(markerLayerRef.current);
      }

      if (!hasDriver) return;

      const marker = L.marker([point.lat, point.lng], {
        icon: truckMarkerIcon,
        zIndexOffset: 1000,
      });

      const popupParts = [
        `<strong>${point.label || `Ride #${point.ride_id || "-"}`}</strong>`,
      ];
      if (point.subtitle) popupParts.push(point.subtitle);
      if (typeof point.speed_kmh === "number") popupParts.push(`Speed: ${point.speed_kmh} km/h`);
      if (typeof point.accuracy_m === "number") popupParts.push(`Accuracy: ${point.accuracy_m} m`);
      if (point.updated_at) popupParts.push(`Updated: ${new Date(point.updated_at).toLocaleString()}`);
      marker.bindPopup(popupParts.join("<br/>"));
      marker.bindTooltip(point.label || `Ride #${point.ride_id || "-"}`, {
        direction: "top",
        offset: [0, -10],
      });

      marker.addTo(markerLayerRef.current);
      bounds.extend([point.lat, point.lng]);
    });

    if (!bounds.isValid()) {
      mapRef.current.setView(INDIA_CENTER, DEFAULT_ZOOM);
      return;
    }

    const shouldRecenter = followLive || manualRecenterCount > 0;
    if (!shouldRecenter) return;

    if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
      mapRef.current.setView(bounds.getCenter(), 14);
      if (!followLive && manualRecenterCount > 0) {
        setManualRecenterCount(0);
      }
      return;
    }

    mapRef.current.fitBounds(bounds.pad(0.25), { animate: true, maxZoom: 14 });
    if (!followLive && manualRecenterCount > 0) {
      setManualRecenterCount(0);
    }
  }, [ridePoints, plannedRouteByRide, remainingRouteByRide, followLive, manualRecenterCount, truckMarkerIcon]);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-700">Live GPS Map</span>
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
            Default: Satellite
          </span>
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
            Driver Live: {validPoints.length}
          </span>
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
            Routes: {ridePoints.length}
          </span>
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
            Path Points: {totalPathPoints}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-slate-200 overflow-hidden bg-white text-xs">
            <button
              type="button"
              onClick={() => setMapStyle("street")}
              className={`px-3 py-1.5 ${mapStyle === "street" ? "bg-blue-600 text-white" : "text-slate-700"}`}
            >
              Street
            </button>
            <button
              type="button"
              onClick={() => setMapStyle("terrain")}
              className={`px-3 py-1.5 border-l border-slate-200 ${
                mapStyle === "terrain" ? "bg-blue-600 text-white" : "text-slate-700"
              }`}
            >
              Terrain
            </button>
            <button
              type="button"
              onClick={() => setMapStyle("satellite")}
              className={`px-3 py-1.5 border-l border-slate-200 ${
                mapStyle === "satellite" ? "bg-blue-600 text-white" : "text-slate-700"
              }`}
            >
              Satellite
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFollowLive((prev) => !prev)}
            className={`text-xs px-3 py-1.5 rounded border ${
              followLive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {followLive ? "Auto Follow: ON" : "Auto Follow: OFF"}
          </button>
          <button
            type="button"
            onClick={() => setManualRecenterCount((count) => count + 1)}
            className="text-xs px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700"
          >
            Recenter
          </button>
        </div>
      </div>
      <div ref={mapElementRef} className={`w-full ${heightClass}`} />
      <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-white">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: START_COLOR }} />
          Start
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: END_COLOR }} />
          End
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: ROUTE_PLAN_COLOR }}
          />
          Planned Road Route
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: REMAINING_ROUTE_COLOR }}
          />
          Remaining Route
        </span>
        {Object.values(STATUS_META).map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      {ridePoints.length === 0 ? (
        <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          Waiting for live GPS points. Start the ride and allow location access in the driver browser.
        </div>
      ) : null}
    </div>
  );
}
