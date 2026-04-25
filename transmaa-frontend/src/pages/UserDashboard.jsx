import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import LiveTrackingMap from "../components/LiveTrackingMap";
import API from "../services/api";

const TRACKING_ACTIVE_STATUSES = new Set(["started", "in_transit", "delivered"]);

const GOODS_TYPES = [
  "Timber/Plywood/Laminate",
  "Electrical/Electronics/Home Appliances",
  "General",
  "Building/Construction",
  "Catering/Restaurant/Event Management",
  "Machines/Equipments/Spare Parts/Metals",
  "Textile/Garments/Fashion Accessories",
  "Furniture/Home Furnishing",
  "House Shifting",
  "Ceramics/Sanitary/Hardware",
  "Paper/Packaging/Printed Material",
];

const TRUCK_TYPES = [
  "Mini Truck",
  "Pickup Truck",
  "LCV (Light Commercial Vehicle)",
  "Container Truck",
  "Trailer Truck",
  "Open Body Truck",
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online" },
];

const getTodayDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function UserDashboard() {
  const todayDate = getTodayDateString();
  const [userId, setUserId] = useState(null);
  const userEmail = localStorage.getItem("email") || "N/A";
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [weight, setWeight] = useState("");
  const [shiftingDate, setShiftingDate] = useState(todayDate);
  const [shiftingTime, setShiftingTime] = useState("");
  const [goodsType, setGoodsType] = useState("");
  const [truckType, setTruckType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [activeLocationField, setActiveLocationField] = useState(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [pickupSuggestLoading, setPickupSuggestLoading] = useState(false);
  const [dropSuggestLoading, setDropSuggestLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [rides, setRides] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState({ enabled: false, simulation_enabled: false, provider: "razorpay" });
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);
  const [trackingByRide, setTrackingByRide] = useState({});
  const activeTrackingRideIds = rides
    .filter((ride) => TRACKING_ACTIVE_STATUSES.has(ride.status))
    .map((ride) => ride.id);
  const liveMapPoints = rides
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

  const loadMyRides = () => {
    API.get("/rides/my").then((res) => setRides(res.data)).catch(() => setRides([]));
  };

  const loadMyInvoices = () => {
    API.get("/payments/my-invoices").then((res) => setInvoices(res.data || [])).catch(() => setInvoices([]));
  };

  const loadPaymentConfig = () => {
    API.get("/payments/config")
      .then((res) => setPaymentConfig(res.data || { enabled: false, simulation_enabled: false, provider: "razorpay" }))
      .catch(() => setPaymentConfig({ enabled: false, simulation_enabled: false, provider: "razorpay" }));
  };

  const formatTimestamp = (value) => {
    if (!value) return "N/A";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return parsed.toLocaleString();
  };

  useEffect(() => {
    loadMyRides();
    loadMyInvoices();
    loadPaymentConfig();

    const token = localStorage.getItem("token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUserId(payload.user_id ?? null);
      } catch {
        setUserId(null);
      }
    } else {
      setUserId(null);
    }

    const refreshTimer = setInterval(loadMyRides, 10000);
    return () => clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    if (activeTrackingRideIds.length === 0) {
      setTrackingByRide({});
      return;
    }

    let cancelled = false;

    const fetchTracking = async () => {
      const trackingEntries = await Promise.all(
        activeTrackingRideIds.map(async (rideId) => {
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

    fetchTracking();
    const timer = setInterval(fetchTracking, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTrackingRideIds.join(",")]);

  useEffect(() => {
    const text = pickup.trim();
    if (text.length < 2) {
      setPickupSuggestions([]);
      setPickupSuggestLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setPickupSuggestLoading(true);
      try {
        const res = await API.get("/rides/location-suggestions", { params: { q: text, limit: 6 } });
        if (!active) return;
        setPickupSuggestions(res.data || []);
      } catch {
        if (!active) return;
        setPickupSuggestions([]);
      } finally {
        if (active) setPickupSuggestLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pickup]);

  useEffect(() => {
    const text = drop.trim();
    if (text.length < 2) {
      setDropSuggestions([]);
      setDropSuggestLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setDropSuggestLoading(true);
      try {
        const res = await API.get("/rides/location-suggestions", { params: { q: text, limit: 6 } });
        if (!active) return;
        setDropSuggestions(res.data || []);
      } catch {
        if (!active) return;
        setDropSuggestions([]);
      } finally {
        if (active) setDropSuggestLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [drop]);

  useEffect(() => {
    const pickupText = pickup.trim();
    const dropText = drop.trim();

    if (pickupText.length < 3 || dropText.length < 3) {
      setQuote(null);
      setQuoteError("");
      setQuoteLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      setQuoteError("");
      try {
        const res = await API.get("/rides/estimate", {
          params: { pickup_location: pickupText, drop_location: dropText },
        });
        if (!active) return;
        setQuote(res.data);
      } catch (error) {
        if (!active) return;
        setQuote(null);
        setQuoteError(error.response?.data?.detail || "Unable to estimate fare for these locations");
      } finally {
        if (active) setQuoteLoading(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pickup, drop]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quote) {
      alert("Please enter valid pickup and drop locations to get fare estimate before booking.");
      return;
    }

    try {
      await API.post("/rides/request", {
        pickup_location: pickup,
        drop_location: drop,
        load_weight: parseFloat(weight),
        shifting_date: shiftingDate,
        shifting_time: shiftingTime,
        goods_type: goodsType,
        truck_type: truckType,
        payment_method: paymentMethod,
      });

      setPickup("");
      setDrop("");
      setWeight("");
      setShiftingDate(todayDate);
      setShiftingTime("");
      setGoodsType("");
      setTruckType("");
      setPaymentMethod("cash");
      setPickupSuggestions([]);
      setDropSuggestions([]);
      setActiveLocationField(null);
      setQuote(null);
      setQuoteError("");
      loadMyRides();
      alert(`Ride requested successfully. Estimated fare: ${formatAmount(quote.price, quote.price_currency || "INR")}`);
    } catch (error) {
      alert(error.response?.data?.detail || "Error booking ride");
    }
  };

  const cancelRide = async (rideId) => {
    try {
      await API.put(`/rides/cancel/${rideId}`);
      loadMyRides();
    } catch (error) {
      alert(error.response?.data?.detail || "Unable to cancel");
    }
  };

  const formatAmount = (amount, currency = "INR") =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const canPay = paymentConfig.enabled || paymentConfig.simulation_enabled;

  const payInvoice = async (invoice) => {
    if (!canPay) {
      alert("Payments are currently disabled. Please contact support.");
      return;
    }

    setPayingInvoiceId(invoice.id);
    let checkoutOpened = false;

    try {
      const orderRes = await API.post(`/payments/invoices/${invoice.id}/create-order`);
      const order = orderRes.data;

      if (order.simulate_mode) {
        await API.post(`/payments/invoices/${invoice.id}/simulate-success`);
        await loadMyInvoices();
        alert("Payment completed in simulation mode.");
        return;
      }

      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        throw new Error("Unable to load Razorpay checkout");
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Transmaa Logistics",
        description: `Invoice #${invoice.id}`,
        order_id: order.order_id,
        prefill: {
          email: localStorage.getItem("email") || "",
        },
        handler: async (response) => {
          try {
            await API.post(`/payments/invoices/${invoice.id}/verify`, response);
            await loadMyInvoices();
            alert("Payment successful.");
          } catch (error) {
            alert(error.response?.data?.detail || "Payment verification failed");
          } finally {
            setPayingInvoiceId(null);
          }
        },
        modal: {
          ondismiss: () => setPayingInvoiceId(null),
        },
        theme: {
          color: "#1d4ed8",
        },
      };

      checkoutOpened = true;
      const razorpay = new window.Razorpay(options);
      razorpay.on("payment.failed", (response) => {
        alert(response.error?.description || "Payment failed");
        setPayingInvoiceId(null);
      });
      razorpay.open();
    } catch (error) {
      alert(error.response?.data?.detail || error.message || "Unable to start payment");
    } finally {
      if (!checkoutOpened) {
        setPayingInvoiceId(null);
      }
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <h1 className="text-3xl font-bold">User Dashboard</h1>
        <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm text-slate-700 md:text-right">
          <p>
            <span className="font-semibold">User ID:</span> {userId ?? "N/A"}
          </p>
          <p className="break-all">
            <span className="font-semibold">Email:</span> {userEmail}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div className="relative">
          <input
            type="text"
            placeholder="Pickup Location"
            className="w-full p-3 border rounded"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            onFocus={() => setActiveLocationField("pickup")}
            onBlur={() => setTimeout(() => setActiveLocationField((prev) => (prev === "pickup" ? null : prev)), 120)}
            required
          />
          {activeLocationField === "pickup" && (
            <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow max-h-56 overflow-auto">
              {pickupSuggestLoading && (
                <div className="px-3 py-2 text-sm text-slate-500">Searching locations...</div>
              )}
              {!pickupSuggestLoading && pickupSuggestions.map((item, index) => (
                <button
                  type="button"
                  key={`${item.value}-${index}`}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
                  onMouseDown={() => {
                    setPickup(item.value);
                    setPickupSuggestions([]);
                    setActiveLocationField(null);
                  }}
                >
                  <p className="text-sm font-medium text-slate-700">{item.short_name || item.value}</p>
                  <p className="text-xs text-slate-500 truncate">{item.label}</p>
                </button>
              ))}
              {!pickupSuggestLoading && pickup.trim().length >= 2 && pickupSuggestions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">No location suggestions</div>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Drop Location"
            className="w-full p-3 border rounded"
            value={drop}
            onChange={(e) => setDrop(e.target.value)}
            onFocus={() => setActiveLocationField("drop")}
            onBlur={() => setTimeout(() => setActiveLocationField((prev) => (prev === "drop" ? null : prev)), 120)}
            required
          />
          {activeLocationField === "drop" && (
            <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow max-h-56 overflow-auto">
              {dropSuggestLoading && (
                <div className="px-3 py-2 text-sm text-slate-500">Searching locations...</div>
              )}
              {!dropSuggestLoading && dropSuggestions.map((item, index) => (
                <button
                  type="button"
                  key={`${item.value}-${index}`}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0"
                  onMouseDown={() => {
                    setDrop(item.value);
                    setDropSuggestions([]);
                    setActiveLocationField(null);
                  }}
                >
                  <p className="text-sm font-medium text-slate-700">{item.short_name || item.value}</p>
                  <p className="text-xs text-slate-500 truncate">{item.label}</p>
                </button>
              ))}
              {!dropSuggestLoading && drop.trim().length >= 2 && dropSuggestions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">No location suggestions</div>
              )}
            </div>
          )}
        </div>

        <input
          type="number"
          placeholder="Load Weight (tons)"
          className="w-full p-3 border rounded"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="date"
            className="w-full p-3 border rounded"
            value={shiftingDate}
            min={todayDate}
            onChange={(e) => setShiftingDate(e.target.value)}
            required
          />
          <input
            type="time"
            className="w-full p-3 border rounded"
            value={shiftingTime}
            onChange={(e) => setShiftingTime(e.target.value)}
            required
          />
        </div>

        <select
          className="w-full p-3 border rounded bg-white"
          value={goodsType}
          onChange={(e) => setGoodsType(e.target.value)}
          required
        >
          <option value="" disabled>Select Type Of Goods</option>
          {GOODS_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          className="w-full p-3 border rounded bg-white"
          value={truckType}
          onChange={(e) => setTruckType(e.target.value)}
          required
        >
          <option value="" disabled>Select Truck Type</option>
          {TRUCK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <div className="rounded border p-3">
          <p className="text-sm font-semibold text-slate-700 mb-2">Payment Method</p>
          <div className="flex flex-wrap gap-4">
            {PAYMENT_METHODS.map((method) => (
              <label key={method.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="payment_method"
                  value={method.value}
                  checked={paymentMethod === method.value}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span>{method.label}</span>
              </label>
            ))}
          </div>
        </div>

        {quoteLoading && <p className="text-sm text-slate-500">Calculating fare based on distance...</p>}

        {!quoteLoading && quote && (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
            <p className="font-semibold">Fare Estimate</p>
            <p>Distance: {Number(quote.distance_km || 0).toFixed(2)} km</p>
            <p>Rate: {formatAmount(quote.per_km_rate || 0, quote.price_currency || "INR")} / km</p>
            <p className="font-semibold">Estimated Price: {formatAmount(quote.price || 0, quote.price_currency || "INR")}</p>
          </div>
        )}

        {!quoteLoading && quoteError && (
          <p className="text-sm text-rose-600">{quoteError}</p>
        )}

        <button className="bg-blue-600 text-white p-3 rounded w-full">
          Request Ride
        </button>
      </form>

      {activeTrackingRideIds.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Live Load Map</h2>
          <LiveTrackingMap points={liveMapPoints} heightClass="h-[520px]" />
        </div>
      )}

      <h2 className="text-2xl font-semibold mb-4">My Rides</h2>
      <div className="space-y-3">
        {rides.length === 0 ? (
          <p className="text-gray-500">No rides yet.</p>
        ) : (
          rides.map((ride) => (
            <div key={ride.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">Ride #{ride.id}</p>
                <p className="text-sm text-gray-600">
                  {ride.pickup_location} {"\u2192"} {ride.drop_location}
                </p>
                <p className="text-sm text-gray-500">Status: {ride.status}</p>
                {ride.shifting_date && (
                  <p className="text-sm text-gray-500">
                    Shifting: {ride.shifting_date}{ride.shifting_time ? ` at ${ride.shifting_time}` : ""}
                  </p>
                )}
                {ride.goods_type && (
                  <p className="text-sm text-gray-500">Goods: {ride.goods_type}</p>
                )}
                {ride.truck_type && (
                  <p className="text-sm text-gray-500">Truck Type: {ride.truck_type}</p>
                )}
                {ride.payment_method && (
                  <p className="text-sm text-gray-500">
                    Payment Method: {String(ride.payment_method).toUpperCase()}
                  </p>
                )}
                {ride.distance_km != null && (
                  <p className="text-sm text-gray-500">Distance: {Number(ride.distance_km).toFixed(2)} km</p>
                )}
                {ride.price != null && (
                  <p className="text-sm font-semibold text-gray-700">
                    Price: {formatAmount(ride.price, ride.price_currency || "INR")}
                  </p>
                )}
                {TRACKING_ACTIVE_STATUSES.has(ride.status) && (
                  <div className="mt-2 rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
                    <p className="font-semibold text-slate-800">Live Tracking</p>
                    {trackingByRide[ride.id] ? (
                      <>
                        <p>
                          Current Location: {Number(trackingByRide[ride.id].lat).toFixed(6)},{" "}
                          {Number(trackingByRide[ride.id].lng).toFixed(6)}
                        </p>
                        <p>Speed: {trackingByRide[ride.id].speed_kmh ?? 0} km/h</p>
                        <p>Accuracy: {trackingByRide[ride.id].accuracy_m ?? "N/A"} m</p>
                        <p>Last Updated: {formatTimestamp(trackingByRide[ride.id].updated_at)}</p>
                      </>
                    ) : (
                      <p>Waiting for driver GPS updates...</p>
                    )}
                  </div>
                )}
              </div>
              {(ride.status === "requested" || ride.status === "accepted") && (
                <button
                  onClick={() => cancelRide(ride.id)}
                  className="px-3 py-2 bg-rose-500 text-white rounded"
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <h2 className="text-2xl font-semibold mt-10 mb-4">My Invoices & Payments</h2>
      {!canPay && (
        <p className="text-sm text-rose-600 mb-3">
          Payment gateway is unavailable right now. Please contact support.
        </p>
      )}
      {paymentConfig.enabled && paymentConfig.provider === "razorpay" && (
        <p className="text-sm text-emerald-700 mb-3">Secure checkout is enabled.</p>
      )}
      {!paymentConfig.enabled && paymentConfig.simulation_enabled && (
        <p className="text-sm text-amber-700 mb-3">
          Running in simulation mode. Payments are mocked for development.
        </p>
      )}

      <div className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-gray-500">
            No invoices found for your account yet. Ask admin to create the invoice with your email, then refresh.
          </p>
        ) : (
          invoices.map((invoice) => {
            const amount = Number(invoice.balance_amount ?? invoice.amount ?? 0);
            const isPaid = invoice.status === "paid" || invoice.payment_status === "paid";
            const isPending = invoice.status === "pending";
            const statusClass = isPaid
              ? "bg-emerald-100 text-emerald-700"
              : isPending
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700";

            return (
              <div key={invoice.id} className="border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">Invoice #{invoice.id}</p>
                  <p className="text-sm text-gray-600">Load #{invoice.load_id} | Due: {invoice.due_date || "N/A"}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Amount: {formatAmount(amount, invoice.currency || "INR")}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusClass}`}>
                    {(invoice.status || "pending").toUpperCase()}
                  </span>
                  <button
                    onClick={() => payInvoice(invoice)}
                    disabled={isPaid || !canPay || payingInvoiceId === invoice.id}
                    className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                  >
                    {isPaid ? "Paid" : payingInvoiceId === invoice.id ? "Processing..." : "Pay Now"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
