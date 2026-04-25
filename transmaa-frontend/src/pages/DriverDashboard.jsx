import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import LiveTrackingMap from "../components/LiveTrackingMap";
import API from "../services/api";

const TRACKING_ACTIVE_STATUSES = new Set(["started", "in_transit", "delivered"]);

export default function DriverDashboard() {
  const [pendingRides, setPendingRides] = useState([]);
  const [myRides, setMyRides] = useState([]);
  const [driverId, setDriverId] = useState(null);
  const [trackingByRide, setTrackingByRide] = useState({});
  const [locationSyncState, setLocationSyncState] = useState({ level: "idle", message: "" });
  const driverEmail = localStorage.getItem("email") || "N/A";
  const activeMyRides = myRides.filter((ride) => !["completed", "cancelled"].includes(ride.status));
  const trackableRideIds = activeMyRides
    .filter((ride) => TRACKING_ACTIVE_STATUSES.has(ride.status))
    .map((ride) => ride.id);
  const liveMapPoints = activeMyRides
    .filter((ride) => TRACKING_ACTIVE_STATUSES.has(ride.status))
    .map((ride) => {
      const tracking = trackingByRide[ride.id];
      return {
        ride_id: ride.id,
        label: `Ride #${ride.id}`,
        subtitle: `${ride.pickup_location} \u2192 ${ride.drop_location}`,
        start_lat: ride.pickup_lat,
        start_lng: ride.pickup_lng,
        end_lat: ride.drop_lat,
        end_lng: ride.drop_lng,
        lat: tracking?.lat,
        lng: tracking?.lng,
        speed_kmh: tracking?.speed_kmh,
        accuracy_m: tracking?.accuracy_m,
        updated_at: tracking?.updated_at,
        path: tracking?.path || [],
        route_path: Array.isArray(ride.route_path) ? ride.route_path : [],
        status: ride.status,
      };
    });

  const formatAmount = (amount, currency = "INR") =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const formatTimestamp = (value) => {
    if (!value) return "N/A";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return parsed.toLocaleString();
  };

  const loadData = () => {
    API.get("/rides/pending").then((res) => setPendingRides(res.data)).catch(() => setPendingRides([]));
    API.get("/rides/driver/my").then((res) => setMyRides(res.data)).catch(() => setMyRides([]));
  };

  useEffect(() => {
    loadData();
    API.get("/drivers/me")
      .then((res) => setDriverId(res.data?.id ?? null))
      .catch(() => setDriverId(null));

    const refreshTimer = setInterval(loadData, 10000);
    return () => clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    if (trackableRideIds.length === 0) {
      setTrackingByRide({});
      return;
    }

    let cancelled = false;

    const refreshTracking = async () => {
      const trackingEntries = await Promise.all(
        trackableRideIds.map(async (rideId) => {
          try {
            const res = await API.get(`/tracking/ride/${rideId}`);
            return [rideId, res.data];
          } catch {
            return [rideId, null];
          }
        })
      );

      if (cancelled) return;

      const nextTracking = {};
      trackingEntries.forEach(([rideId, payload]) => {
        if (payload && payload.status !== "no_tracking") {
          nextTracking[rideId] = payload;
        }
      });
      setTrackingByRide(nextTracking);
    };

    refreshTracking();
    const timer = setInterval(refreshTracking, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [trackableRideIds.join(",")]);

  useEffect(() => {
    if (trackableRideIds.length === 0) {
      setLocationSyncState({ level: "idle", message: "" });
      return;
    }

    if (!navigator.geolocation) {
      setLocationSyncState({
        level: "error",
        message: "Live tracking unavailable: browser geolocation is not supported on this device.",
      });
      return;
    }

    let cancelled = false;

    const syncLocation = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (cancelled) return;

          const speedMetersPerSecond = position.coords.speed;
          const speedKmh =
            speedMetersPerSecond == null || Number.isNaN(speedMetersPerSecond)
              ? null
              : Number((speedMetersPerSecond * 3.6).toFixed(1));

          const payload = {
            lat: Number(position.coords.latitude),
            lng: Number(position.coords.longitude),
            speed_kmh: speedKmh,
            accuracy_m:
              position.coords.accuracy == null || Number.isNaN(position.coords.accuracy)
                ? null
                : Number(position.coords.accuracy.toFixed(1)),
          };

          const results = await Promise.allSettled(
            trackableRideIds.map((rideId) =>
              API.post("/tracking/heartbeat", {
                ride_id: rideId,
                ...payload,
              })
            )
          );

          if (cancelled) return;

          const failed = results.filter((item) => item.status === "rejected").length;
          if (failed > 0) {
            setLocationSyncState({
              level: "error",
              message: `Location sync failed for ${failed} ride(s). Retrying automatically.`,
            });
            return;
          }

          setLocationSyncState({
            level: "ok",
            message: `Live location synced for ${trackableRideIds.length} active ride(s).`,
          });

          const syncedAt = new Date().toISOString();
          const nextPoint = {
            lat: payload.lat,
            lng: payload.lng,
            speed_kmh: payload.speed_kmh,
            accuracy_m: payload.accuracy_m,
            recorded_at: syncedAt,
          };
          setTrackingByRide((prev) => {
            const next = { ...prev };
            trackableRideIds.forEach((rideId) => {
              const existingPath = Array.isArray(next[rideId]?.path) ? next[rideId].path : [];
              next[rideId] = {
                ...(next[rideId] || {}),
                ride_id: rideId,
                lat: payload.lat,
                lng: payload.lng,
                speed_kmh: payload.speed_kmh,
                accuracy_m: payload.accuracy_m,
                updated_at: syncedAt,
                path: [...existingPath, nextPoint].slice(-120),
              };
            });
            return next;
          });
        },
        (error) => {
          if (cancelled) return;

          let message = "Unable to read live location from your device.";
          if (error?.code === 1) message = "Location permission denied. Please allow location access for live tracking.";
          if (error?.code === 2) message = "Location unavailable. Please check GPS/network and try again.";
          if (error?.code === 3) message = "Location request timed out. Retrying automatically.";

          setLocationSyncState({ level: "error", message });
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5000,
        }
      );
    };

    syncLocation();
    const timer = setInterval(syncLocation, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [trackableRideIds.join(",")]);

  const acceptRide = async (rideId) => {
    try {
      await API.put(`/rides/accept/${rideId}`, {});
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error accepting ride");
    }
  };

  const updateStatus = async (rideId, action) => {
    try {
      await API.put(`/rides/${action}/${rideId}`);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error updating ride");
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Driver Dashboard</h1>
            <p className="text-gray-600">Available Ride Requests: {pendingRides.length}</p>
          </div>
          <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-700 md:text-right">
            <p>
              <span className="font-semibold">Driver ID:</span> {driverId ?? "N/A"}
            </p>
            <p className="break-all">
              <span className="font-semibold">Email:</span> {driverEmail}
            </p>
          </div>
        </div>

        {trackableRideIds.length > 0 && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              locationSyncState.level === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {locationSyncState.message || "Live tracking is active for your started ride(s)."}
          </div>
        )}

        {trackableRideIds.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">Live Load Map</h2>
            <LiveTrackingMap points={liveMapPoints} heightClass="h-[520px]" />
          </div>
        )}

        <div>
          <h2 className="text-2xl font-semibold mb-4">Available Requests</h2>
          {pendingRides.length === 0 ? (
            <div className="bg-white p-6 rounded-xl shadow text-center text-gray-500">No rides available right now</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {pendingRides.map((ride) => (
                <div key={ride.id} className="bg-white p-6 rounded-xl shadow">
                  <h3 className="text-xl font-semibold mb-2">Ride #{ride.id}</h3>
                  <p><strong>Pickup:</strong> {ride.pickup_location}</p>
                  <p><strong>Drop:</strong> {ride.drop_location}</p>
                  <p><strong>Load:</strong> {ride.load_weight} tons</p>
                  <p><strong>Price:</strong> {ride.price != null ? formatAmount(ride.price, ride.price_currency || "INR") : "Not available"}</p>
                  <p><strong>Payment:</strong> {String(ride.payment_method || "cash").toUpperCase()}</p>
                  <button
                    onClick={() => acceptRide(ride.id)}
                    className="mt-4 w-full bg-green-600 text-white py-2 rounded-lg"
                  >
                    Accept Ride
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">My Active Rides</h2>
          <div className="space-y-3">
            {activeMyRides.length === 0 ? (
              <p className="text-gray-500">No assigned rides yet.</p>
            ) : (
              activeMyRides.map((ride) => (
                <div key={ride.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Ride #{ride.id}</p>
                    <p className="text-sm text-gray-600">
                      {ride.pickup_location} {"\u2192"} {ride.drop_location}
                    </p>
                    <p className="text-sm text-gray-500">Status: {ride.status}</p>
                    <p className="text-sm text-gray-500">
                      Price: {ride.price != null ? formatAmount(ride.price, ride.price_currency || "INR") : "Not available"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Payment: {String(ride.payment_method || "cash").toUpperCase()}
                    </p>
                    {TRACKING_ACTIVE_STATUSES.has(ride.status) && (
                      <div className="mt-2 rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                        <p className="font-semibold text-slate-800">Live Tracking</p>
                        {trackingByRide[ride.id] ? (
                          <>
                            <p>
                              Location: {Number(trackingByRide[ride.id].lat).toFixed(6)},{" "}
                              {Number(trackingByRide[ride.id].lng).toFixed(6)}
                            </p>
                            <p>Speed: {trackingByRide[ride.id].speed_kmh ?? 0} km/h</p>
                            <p>Accuracy: {trackingByRide[ride.id].accuracy_m ?? "N/A"} m</p>
                            <p>Last Updated: {formatTimestamp(trackingByRide[ride.id].updated_at)}</p>
                          </>
                        ) : (
                          <p>Waiting for first GPS update...</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {ride.status === "accepted" && <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => updateStatus(ride.id, "start")}>Start</button>}
                    {ride.status === "started" && <button className="px-3 py-2 bg-amber-600 text-white rounded" onClick={() => updateStatus(ride.id, "in-transit")}>In Transit</button>}
                    {ride.status === "in_transit" && <button className="px-3 py-2 bg-violet-600 text-white rounded" onClick={() => updateStatus(ride.id, "deliver")}>Deliver</button>}
                    {ride.status === "delivered" && <button className="px-3 py-2 bg-emerald-700 text-white rounded" onClick={() => updateStatus(ride.id, "complete")}>Complete</button>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
