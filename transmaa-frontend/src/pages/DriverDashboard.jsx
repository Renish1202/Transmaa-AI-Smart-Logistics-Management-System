import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

export default function DriverDashboard() {
  const [pendingRides, setPendingRides] = useState([]);
  const [myRides, setMyRides] = useState([]);

  const loadData = () => {
    API.get("/rides/pending").then((res) => setPendingRides(res.data)).catch(() => setPendingRides([]));
    API.get("/rides/driver/my").then((res) => setMyRides(res.data)).catch(() => setMyRides([]));
  };

  useEffect(() => {
    loadData();
  }, []);

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
        <div>
          <h1 className="text-3xl font-bold mb-2">Driver Dashboard</h1>
          <p className="text-gray-600">Available Ride Requests: {pendingRides.length}</p>
        </div>

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
            {myRides.length === 0 ? (
              <p className="text-gray-500">No assigned rides yet.</p>
            ) : (
              myRides.map((ride) => (
                <div key={ride.id} className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Ride #{ride.id}</p>
                    <p className="text-sm text-gray-600">{ride.pickup_location} -> {ride.drop_location}</p>
                    <p className="text-sm text-gray-500">Status: {ride.status}</p>
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
