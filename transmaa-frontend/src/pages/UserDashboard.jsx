import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

export default function UserDashboard() {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [weight, setWeight] = useState("");
  const [rides, setRides] = useState([]);

  const loadMyRides = () => {
    API.get("/rides/my").then((res) => setRides(res.data)).catch(() => setRides([]));
  };

  useEffect(() => {
    loadMyRides();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await API.post("/rides/request", {
        pickup_location: pickup,
        drop_location: drop,
        load_weight: parseFloat(weight),
      });

      setPickup("");
      setDrop("");
      setWeight("");
      loadMyRides();
      alert("Ride requested successfully.");
    } catch {
      alert("Error booking ride");
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

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-6">Book Ride</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <input
          type="text"
          placeholder="Pickup Location"
          className="w-full p-3 border rounded"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Drop Location"
          className="w-full p-3 border rounded"
          value={drop}
          onChange={(e) => setDrop(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Load Weight (tons)"
          className="w-full p-3 border rounded"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
        />

        <button className="bg-blue-600 text-white p-3 rounded w-full">
          Request Ride
        </button>
      </form>

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
    </Layout>
  );
}
