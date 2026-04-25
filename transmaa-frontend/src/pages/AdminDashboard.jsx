import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import SupportChatPanel from "../components/SupportChatPanel";
import LiveTrackingMap from "../components/LiveTrackingMap";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

const navItems = [
  "Dashboard",
  "Orders / Loads",
  "Ride History",
  "Dispatch Board",
  "Fleet",
  "Drivers",
  "Routes & Tracking",
  "Warehouses / Hubs",
  "Proof of Delivery",
  "Billing & Invoices",
  "Reports",
  "AI Ops Assistant",
  "Support Chat",
  "Settings",
];

const defaultOps = {
  kpis: { active_loads: 0, on_time_percent: 0, trucks_available: 0, exceptions: 0, fuel_cost_mtd: 0, revenue_mtd: 0 },
  loads: [],
  dispatch_board: { Unassigned: [], Assigned: [], "In Transit": [], Delivered: [] },
  fleet: { total: 0, available: 0, in_use: 0, maintenance: 0, health_score: 0 },
  drivers: { total: 0, available: 0, hos_risk_alerts: 0, avg_rating: 0 },
  routes: { active: 0, on_time: 0, critical_delays: 0, status_ok: "0/0", recent_events: [] },
  warehouses: [],
  pod: { pending_upload: 0, submitted: 0, approved: 0, rejected: 0, items: [] },
  billing: { outstanding: 0, paid: 0, pending: 0, overdue: 0, items: [] },
  reports: { on_time_series: [] },
  ai: { suggestions: [], risk_alerts: [] },
};

function Badge({ status }) {
  const colors = {
    "In Transit": "bg-emerald-100 text-emerald-700",
    Assigned: "bg-blue-100 text-blue-700",
    Loading: "bg-amber-100 text-amber-700",
    Delivered: "bg-violet-100 text-violet-700",
    Requested: "bg-gray-100 text-gray-700",
    Unassigned: "bg-gray-100 text-gray-700",
    Completed: "bg-emerald-100 text-emerald-700",
    Cancelled: "bg-rose-100 text-rose-700",
    Submitted: "bg-blue-100 text-blue-700",
    Approved: "bg-emerald-100 text-emerald-700",
    Rejected: "bg-rose-100 text-rose-700",
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-emerald-100 text-emerald-700",
    overdue: "bg-rose-100 text-rose-700",
  };
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status] || "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

function Panel({ title, actions, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <div className="flex gap-2">{actions}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [active, setActive] = useState("Dashboard");
  const [ops, setOps] = useState(defaultOps);
  const [loading, setLoading] = useState(true);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [rideHistory, setRideHistory] = useState([]);
  const [rideHistoryLoading, setRideHistoryLoading] = useState(false);
  const [tracking, setTracking] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const apiBaseUrl = API.defaults.baseURL || "";
  const currentUserEmail = localStorage.getItem("email");
  const currentUserRole = localStorage.getItem("role");
  const currentUserLabel = currentUserEmail
    ? `${currentUserEmail}${currentUserRole ? ` · ${currentUserRole}` : ""}`
    : (currentUserRole || "Admin");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const refreshOps = async () => {
    const res = await API.get("/admin/ops/overview");
    setOps({ ...defaultOps, ...res.data });
  };

  const refreshPendingDrivers = async () => {
    const res = await API.get("/admin/drivers/pending");
    setPendingDrivers(res.data || []);
  };

  const refreshRideHistory = async () => {
    setRideHistoryLoading(true);
    try {
      const res = await API.get("/rides/admin/history");
      setRideHistory(res.data || []);
    } catch {
      setRideHistory([]);
    } finally {
      setRideHistoryLoading(false);
    }
  };

  const refreshTracking = async () => {
    setTrackingLoading(true);
    setTrackingError("");
    try {
      const res = await API.get("/tracking/active");
      setTracking(res.data || []);
    } catch (err) {
      setTrackingError(err.response?.data?.detail || "Failed to load tracking");
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([refreshOps(), refreshPendingDrivers()])
      .catch((err) => console.log(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!["Dashboard", "Routes & Tracking"].includes(active)) return;
    refreshTracking();
    const timer = setInterval(refreshTracking, 4000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (active !== "Ride History") return;
    refreshRideHistory();
  }, [active]);

  const runAction = async (fn, successMsg) => {
    try {
      await fn();
      await Promise.all([refreshOps(), refreshPendingDrivers()]);
      alert(successMsg);
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || "Action failed";
      alert(msg);
    }
  };

  const createLoad = () => {
    const pickup = prompt("Pickup location:");
    if (!pickup) return;
    const drop = prompt("Drop location:");
    if (!drop) return;
    const weight = Number(prompt("Load weight (tons):", "10"));
    const customerEmail = prompt("Customer email (optional):", "") || "";

    runAction(
      () => API.post("/admin/ops/loads/create", {
        pickup_location: pickup,
        drop_location: drop,
        load_weight: weight,
        customer_email: customerEmail || null,
        eta: "TBD",
        priority: "medium",
      }),
      "Load created"
    );
  };

  const assignDriver = () => {
    const rideId = Number(prompt("Ride ID (numeric, from LD-xxxxxx):", ""));
    const driverUserId = Number(prompt("Driver user ID:", ""));
    if (!rideId || !driverUserId) return;
    runAction(() => API.put(`/admin/ops/loads/${rideId}/assign`, { driver_user_id: driverUserId }), "Driver assigned");
  };

  const planRoute = () => {
    const rideId = Number(prompt("Ride ID (numeric):", ""));
    const distance = Number(prompt("Distance km:", "100"));
    const notes = prompt("Route notes:", "Auto generated route") || "";
    if (!rideId) return;
    runAction(() => API.post(`/admin/ops/loads/${rideId}/plan-route`, { distance_km: distance, notes }), "Route planned");
  };

  const generateInvoice = () => {
    const rideId = Number(prompt("Ride ID (numeric):", ""));
    const customer = prompt("Customer:", "") || "";
    const customerEmail = prompt("Customer email (optional, enables user-side payment):", "") || "";
    const amount = Number(prompt("Amount:", "1000"));
    const dueDate = prompt("Due date (YYYY-MM-DD):", "") || "";
    const currency = prompt("Currency (default INR):", "INR") || "INR";
    if (!rideId || !amount) return;
    runAction(
      () => API.post("/admin/ops/invoices/create", { load_id: rideId, customer, customer_email: customerEmail || null, amount, due_date: dueDate, currency }),
      "Invoice generated"
    );
  };

  const autoAssign = () => runAction(() => API.post("/admin/ops/loads/auto-assign"), "Auto-assign completed");
  const parseRideId = (row) => {
    const direct = Number(row?.ride_id);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const match = String(row?.id || "").match(/LD-(\d+)/i);
    const parsed = Number(match?.[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;

    return null;
  };
  const updateLoadStatus = (rideId, status) => {
    if (!Number.isFinite(Number(rideId)) || Number(rideId) <= 0) {
      alert("Ride ID is unavailable for this load. Create a real load first.");
      return;
    }
    runAction(() => API.put(`/admin/ops/loads/${rideId}/status`, { status }), "Load status updated");
  };
  const reviewPod = (podId, status) => runAction(() => API.put(`/admin/ops/pod/${podId}/review`, { status }), `POD ${status}`);
  const updateInvoiceStatus = (invoiceId, status) => runAction(() => API.put(`/admin/ops/invoices/${invoiceId}/status`, { status }), "Invoice updated");
  const reviewDriver = (driverId, status) =>
    runAction(
      () => API.put(`/admin/drivers/verify/${driverId}`, null, { params: { status } }),
      `Driver ${status}`
    );

  const fileUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${apiBaseUrl}/${normalized}`;
  };

  const uploadPod = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const loadId = Number(prompt("Load ID for this POD (numeric ride id):", ""));
    if (!loadId) return;

    const fd = new FormData();
    fd.append("load_id", loadId);
    fd.append("file", file);
    await runAction(() => API.post("/admin/ops/pod/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }), "POD uploaded");
    event.target.value = "";
  };

  const kpis = useMemo(() => [
    { label: "Active Loads", value: ops.kpis.active_loads, sub: "Live from dispatch" },
    { label: "On-time %", value: `${ops.kpis.on_time_percent}%`, sub: "ETA model output" },
    { label: "Trucks Available", value: ops.kpis.trucks_available, sub: "Current availability" },
    { label: "Exceptions", value: ops.kpis.exceptions, sub: "Needs review" },
    { label: "Fuel Cost (MTD)", value: `$${(ops.kpis.fuel_cost_mtd / 1000).toFixed(1)}K`, sub: "Month to date" },
    { label: "Revenue (MTD)", value: `$${(ops.kpis.revenue_mtd / 1000000).toFixed(1)}M`, sub: "Month to date" },
  ], [ops]);

  const trackingMapPoints = useMemo(
    () =>
      (tracking || []).map((item) => {
        const truckLabel = item?.truck_number ? `Truck ${item.truck_number}` : null;
        const driverLabel = item?.driver_id ? `Driver #${item.driver_id}` : "Unassigned driver";
        const baseLabel = truckLabel || driverLabel;
        return {
          ride_id: item.ride_id,
          label: `${item.load_id || `Ride #${item.ride_id || "-"}`} - ${baseLabel}`,
          subtitle: `${item.pickup_location || "Pickup"} -> ${item.drop_location || "Drop"}`,
          start_lat: item.pickup_lat,
          start_lng: item.pickup_lng,
          end_lat: item.drop_lat,
          end_lng: item.drop_lng,
          lat: item.lat,
          lng: item.lng,
          speed_kmh: item.speed_kmh,
          accuracy_m: item.accuracy_m,
          updated_at: item.updated_at,
          path: Array.isArray(item.path) ? item.path : [],
          route_path: Array.isArray(item.route_path) ? item.route_path : [],
          status: item.status,
        };
      }),
    [tracking]
  );

  const liveUnitCount = useMemo(
    () =>
      trackingMapPoints.filter(
        (item) => typeof item.lat === "number" && typeof item.lng === "number"
      ).length,
    [trackingMapPoints]
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid xl:grid-cols-6 md:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm text-slate-500">{kpi.label}</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{kpi.value}</p>
            <p className="text-xs text-emerald-600 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <Panel title="Live Operations">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {trackingLoading
                ? "Updating live fleet feed..."
                : trackingError
                  ? trackingError
                  : `Live units on map: ${liveUnitCount}`}
            </div>
            <LiveTrackingMap points={trackingMapPoints} heightClass="h-[360px]" />
          </div>
        </Panel>

        <Panel title="Today's Dispatch">
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {ops.loads.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{item.id}</p>
                    <p className="text-sm text-slate-500">{item.route}</p>
                    <p className="text-xs text-slate-400">Driver: {item.driver}</p>
                  </div>
                  <Badge status={item.status} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={createLoad} className="py-4 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition">Create Load</button>
            <button onClick={assignDriver} className="py-4 rounded-xl font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition">Assign Driver</button>
            <button onClick={generateInvoice} className="py-4 rounded-xl font-semibold bg-violet-600 text-white hover:bg-violet-700 transition">Generate Invoice</button>
            <button onClick={planRoute} className="py-4 rounded-xl font-semibold bg-amber-600 text-white hover:bg-amber-700 transition">Plan Route</button>
          </div>
        </Panel>
      </div>
    </div>
  );

  const renderOrders = () => (
    <Panel title="Orders / Loads" actions={<button onClick={createLoad} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Create New Load</button>}>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2">Load ID</th><th>Customer</th><th>Route</th><th>ETA</th><th>Status</th><th>Margin</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ops.loads.map((row) => {
              const rideId = parseRideId(row);
              const actionsDisabled = !rideId;
              return (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-3 font-semibold text-blue-700">{row.id}</td>
                  <td>{row.customer}</td>
                  <td>{row.route}</td>
                  <td>{row.eta}</td>
                  <td><Badge status={row.status} /></td>
                  <td className="font-semibold text-emerald-700">{row.margin}%</td>
                  <td className="space-x-1">
                    <button className="px-2 py-1 text-xs bg-slate-100 rounded disabled:opacity-50" disabled={actionsDisabled} onClick={() => updateLoadStatus(rideId, "loading")}>Loading</button>
                    <button className="px-2 py-1 text-xs bg-slate-100 rounded disabled:opacity-50" disabled={actionsDisabled} onClick={() => updateLoadStatus(rideId, "in_transit")}>Transit</button>
                    <button className="px-2 py-1 text-xs bg-slate-100 rounded disabled:opacity-50" disabled={actionsDisabled} onClick={() => updateLoadStatus(rideId, "delivered")}>Delivered</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  const renderDispatch = () => (
    <Panel title="Dispatch Board" actions={<button onClick={autoAssign} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm">Auto-Assign</button>}>
      <div className="grid md:grid-cols-4 gap-4">
        {Object.entries(ops.dispatch_board).map(([column, cards]) => (
          <div key={column} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="font-semibold mb-3">{column}</p>
            <div className="space-y-2">{cards.map((c) => <div key={c} className="bg-white border border-slate-200 rounded-lg p-2 text-sm font-medium">{c}</div>)}</div>
          </div>
        ))}
      </div>
    </Panel>
  );

  const renderRideHistory = () => (
    <Panel title="Ride History">
      {rideHistoryLoading ? (
        <p className="text-slate-500">Loading ride history...</p>
      ) : rideHistory.length === 0 ? (
        <p className="text-slate-500">No rides found.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2">Ride</th>
                <th>Route</th>
                <th>Customer</th>
                <th>Driver</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rideHistory.map((ride) => (
                <tr key={ride.id} className="border-b border-slate-100">
                  <td className="py-2 font-semibold text-blue-700">LD-{String(ride.id).padStart(6, "0")}</td>
                  <td>{ride.pickup_location} {"\u2192"} {ride.drop_location}</td>
                  <td>{ride.passenger_email || ride.passenger_id || "N/A"}</td>
                  <td>{ride.driver_email || ride.driver_id || "Unassigned"}</td>
                  <td className="capitalize">{ride.payment_mode || ride.payment_method || "cash"} ({ride.payment_status || "pending"})</td>
                  <td><Badge status={String(ride.status || "requested").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );

  const renderFleetDrivers = (title, summary) => (
    <Panel title={title}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4"><p className="text-sm text-slate-500">Total</p><p className="text-3xl font-bold text-slate-800 mt-2">{summary.total}</p><p className="text-sm text-emerald-600">Available: {summary.available}</p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4"><p className="text-sm text-slate-500">Operational Index</p><p className="text-3xl font-bold text-slate-800 mt-2">{summary.health_score || summary.avg_rating}</p><p className="text-sm text-amber-600">Risk alerts: {summary.hos_risk_alerts || 0}</p></div>
      </div>
      {title === "Driver Management" ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-700 mb-2">
            Pending Driver Registrations
          </p>
          {pendingDrivers.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              No pending driver requests.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="border border-slate-200 rounded-lg p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="text-sm space-y-1">
                    <p className="font-semibold text-slate-800">Driver ID: {driver.id}</p>
                    <p className="text-slate-500">
                      User ID: {driver.user_id} | Status: {driver.verification_status}
                    </p>
                    <p className="text-slate-500">
                      Email: {driver.user_email || "N/A"} | Phone: {driver.user_phone || "N/A"}
                    </p>
                    <p className="text-slate-500">
                      DL: {driver.dl_number || "N/A"} | PAN: {driver.pan_number || "N/A"}
                    </p>
                    <p className="text-slate-500">
                      Vehicle: {driver.vehicle_number || "N/A"} ({driver.vehicle_type || "N/A"}) | Capacity: {driver.capacity_tons || "N/A"} tons
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {driver.dl_image ? (
                        <a
                          href={fileUrl(driver.dl_image)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded"
                        >
                          View DL
                        </a>
                      ) : null}
                      {driver.rc_image ? (
                        <a
                          href={fileUrl(driver.rc_image)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded"
                        >
                          View RC
                        </a>
                      ) : null}
                      {driver.vehicle_image ? (
                        <a
                          href={fileUrl(driver.vehicle_image)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 rounded"
                        >
                          View Vehicle
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded"
                      onClick={() => reviewDriver(driver.id, "approved")}
                    >
                      Accept
                    </button>
                    <button
                      className="text-xs px-3 py-1.5 bg-rose-100 text-rose-800 rounded"
                      onClick={() => reviewDriver(driver.id, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  );

  const renderRoutes = () => {
    const cards = [
      { label: "Active Routes", value: ops.routes.active, tone: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
      { label: "On-Time Performance", value: `${ops.routes.on_time}%`, tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
      { label: "Critical Delays", value: ops.routes.critical_delays, tone: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
      { label: "Fleet Status", value: ops.routes.status_ok, tone: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
    ];

    const liveUnits = (tracking || []).filter(
      (item) => typeof item.lat === "number" && typeof item.lng === "number"
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Routes & Tracking</h2>
            <p className="text-sm text-slate-500">Live visibility across active lanes</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm">Export Data</button>
            <button className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Route Optimization</button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-2xl border border-slate-200 p-4 ${card.tone}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.label}</p>
                </div>
                <div className={`h-10 w-10 rounded-full ${card.dot} flex items-center justify-center text-white text-xs`}>
                  GO
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Route Status</span>
            <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option>All Routes</option>
              <option>Active</option>
              <option>Delayed</option>
              <option>Completed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Time Range</span>
            <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option>Today</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Driver</span>
            <select className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option>All Drivers</option>
              <option>Verified</option>
              <option>Unverified</option>
            </select>
          </div>
          <button className="text-xs text-slate-500 hover:text-slate-700">Clear Filters</button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {trackingLoading
              ? "Updating live feed..."
              : trackingError
                ? trackingError
                : `Showing ${liveUnits.length} live truck/driver unit(s) in one map`}
          </div>
          <LiveTrackingMap points={trackingMapPoints} heightClass="h-[460px]" />
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2 border-b border-slate-100 text-sm font-semibold text-slate-700">
              Live Units ({liveUnits.length})
            </div>
            <div className="max-h-56 overflow-auto">
              {liveUnits.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">No active GPS units available right now.</p>
              ) : (
                liveUnits.map((item) => (
                  <div
                    key={item.load_id || item.ride_id}
                    className="px-4 py-2 border-b border-slate-100 text-xs text-slate-600 flex flex-wrap items-center gap-2"
                  >
                    <span className="font-semibold text-slate-700">{item.load_id}</span>
                    <span>{item.truck_number ? `Truck ${item.truck_number}` : `Driver #${item.driver_id || "-"}`}</span>
                    <span>{item.pickup_location || "Pickup"} {"->"} {item.drop_location || "Drop"}</span>
                    {typeof item.speed_kmh === "number" ? <span>{item.speed_kmh} km/h</span> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWarehouses = () => (
    <Panel title="Warehouses / Hubs">
      <div className="grid md:grid-cols-3 gap-4">
        {ops.warehouses.map((hub) => (
          <div key={hub.name} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <p className="font-semibold text-slate-800">{hub.name}</p>
            <p className="text-sm text-slate-500 mt-1">Capacity Utilization</p>
            <div className="w-full h-2 bg-slate-200 rounded mt-2"><div className="h-2 bg-blue-500 rounded" style={{ width: `${hub.utilization}%` }} /></div>
            <p className="text-xs text-slate-500 mt-2">Dock status: {hub.dock_status}</p>
          </div>
        ))}
      </div>
    </Panel>
  );

  const renderPod = () => (
    <Panel title="Proof of Delivery (POD)" actions={<label className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm cursor-pointer">Upload<input type="file" className="hidden" onChange={uploadPod} /></label>}>
      <div className="grid md:grid-cols-4 gap-3 mb-4 text-sm">
        {["pending_upload", "submitted", "approved", "rejected"].map((key) => (
          <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-slate-500 capitalize">{key.replaceAll("_", " ")}</p><p className="text-2xl font-semibold text-slate-800">{ops.pod[key]}</p></div>
        ))}
      </div>
      <div className="space-y-2">
        {(ops.pod.items || []).slice(0, 10).map((item) => (
          <div key={item.id} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between">
            <div className="text-sm">POD #{item.id} - Load {item.load_id}</div>
            <div className="flex items-center gap-2">
              <Badge status={(item.status || "submitted").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} />
              <button className="text-xs px-2 py-1 bg-emerald-100 rounded" onClick={() => reviewPod(item.id, "approved")}>Approve</button>
              <button className="text-xs px-2 py-1 bg-rose-100 rounded" onClick={() => reviewPod(item.id, "rejected")}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  const renderBilling = () => (
    <Panel title="Billing & Invoices" actions={<button onClick={generateInvoice} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Create Invoice</button>}>
      <div className="grid md:grid-cols-4 gap-3 mb-4 text-sm">
        {["outstanding", "paid", "pending", "overdue"].map((key) => (
          <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-3"><p className="text-slate-500 capitalize">{key}</p><p className="text-2xl font-semibold text-slate-800">{ops.billing[key]}</p></div>
        ))}
      </div>
      <div className="space-y-2">
        {(ops.billing.items || []).slice(0, 10).map((inv) => (
          <div key={inv.id} className="border border-slate-200 rounded-lg p-2 flex items-center justify-between">
            <div className="text-sm">
              INV-{inv.id} Load {inv.load_id} Amount {inv.amount} {inv.currency || "INR"}
              {inv.customer_email ? ` | ${inv.customer_email}` : ""}
            </div>
            <div className="flex items-center gap-2">
              <Badge status={inv.status} />
              <button className="text-xs px-2 py-1 bg-emerald-100 rounded" onClick={() => updateInvoiceStatus(inv.id, "paid")}>Mark Paid</button>
              <button className="text-xs px-2 py-1 bg-rose-100 rounded" onClick={() => updateInvoiceStatus(inv.id, "overdue")}>Mark Overdue</button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  const renderReports = () => (
    <div className="grid md:grid-cols-2 gap-6">
      <Panel title="On-time Performance"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={ops.reports.on_time_series || []}><XAxis dataKey="name" /><YAxis domain={[85, 100]} /><Tooltip /><Line type="monotone" dataKey="onTime" stroke="#10b981" strokeWidth={3} /></LineChart></ResponsiveContainer></div></Panel>
      <Panel title="Delays by Lane"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={ops.reports.on_time_series || []}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="delays" fill="#f59e0b" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
    </div>
  );

  const renderAI = () => (
    <div className="grid md:grid-cols-2 gap-6">
      <Panel title="Driver-Truck Suggestions"><div className="space-y-3 text-sm">{(ops.ai.suggestions || []).map((s) => <div key={s} className="p-3 rounded-xl border border-slate-200 bg-slate-50">{s}</div>)}</div></Panel>
      <Panel title="Delay Risk Alerts"><div className="space-y-3 text-sm">{(ops.ai.risk_alerts || []).map((r) => <div key={r} className="p-3 rounded-xl border border-amber-200 bg-amber-50">{r}</div>)}</div></Panel>
    </div>
  );

  const renderSupportChat = () => (
    <Panel title="Support Chat">
      <SupportChatPanel height="60vh" />
    </Panel>
  );

  const renderContent = () => {
    if (active === "Dashboard") return renderDashboard();
    if (active === "Orders / Loads") return renderOrders();
    if (active === "Ride History") return renderRideHistory();
    if (active === "Dispatch Board") return renderDispatch();
    if (active === "Fleet") return renderFleetDrivers("Fleet - Trucks & Trailers Management", ops.fleet);
    if (active === "Drivers") return renderFleetDrivers("Driver Management", ops.drivers);
    if (active === "Routes & Tracking") return renderRoutes();
    if (active === "Warehouses / Hubs") return renderWarehouses();
    if (active === "Proof of Delivery") return renderPod();
    if (active === "Billing & Invoices") return renderBilling();
    if (active === "Reports") return renderReports();
    if (active === "AI Ops Assistant") return renderAI();
    if (active === "Support Chat") return renderSupportChat();
    return <Panel title="Settings"><p className="text-slate-500">Configuration module placeholder.</p></Panel>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 via-green-800 to-teal-700 p-6">
      <div className="max-w-[1600px] mx-auto border-2 border-emerald-100/60 rounded-3xl p-3 bg-white/10">
        <div className="bg-slate-50 rounded-2xl overflow-hidden">
          <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between bg-white">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">AI-Powered Logistic Dashboard</h1>
              <p className="text-xs text-slate-500">Live operations, dispatch, fleet, compliance, and billing</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-600">{currentUserLabel}</div>
              <button
                onClick={handleLogout}
                className="text-xs px-3 py-1.5 rounded-md bg-rose-600 text-white hover:bg-rose-700 transition"
              >
                Logout
              </button>
            </div>
          </div>

          <div className="flex min-h-[780px]">
            <aside className="w-64 bg-white border-r border-slate-200 p-4">
              <img
                src="/transmaa-logo.svg"
                alt="Transmaa"
                className="h-14 w-auto mb-6"
              />
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item}
                    onClick={() => setActive(item)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${active === item ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </aside>

            <main className="flex-1 p-6 overflow-auto">{loading ? <div className="text-slate-600">Loading operations data...</div> : renderContent()}</main>
          </div>
        </div>
      </div>
    </div>
  );
}

