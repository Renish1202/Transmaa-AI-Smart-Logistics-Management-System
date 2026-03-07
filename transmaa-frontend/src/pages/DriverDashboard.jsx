import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import Layout from "../components/Layout";

export default function DriverDashboard() {

  const [rides, setRides] = useState([]);
  const token = localStorage.getItem("token");

  const fetchRides = useCallback(() => {
    axios
      .get("http://127.0.0.1:8000/rides/pending", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        setRides(res.data);
      })
      .catch((err) => console.log(err));
  }, [token]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const acceptRide = async (rideId) => {
    try {
      await axios.put(
        `http://127.0.0.1:8000/rides/accept/${rideId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Ride Accepted 🚛");

      // remove ride from UI
      setRides(rides.filter((ride) => ride.id !== rideId));

    } catch (err) {
      console.log(err);
      alert("Error accepting ride");
    }
  };

  return (
    <Layout>

      <div className="max-w-5xl mx-auto">

        <h1 className="text-3xl font-bold mb-2">
          🚛 Driver Dashboard
        </h1>

        <p className="text-gray-600 mb-6">
          Available Ride Requests: {rides.length}
        </p>

        {rides.length === 0 ? (
          <div className="bg-white p-10 rounded-xl shadow text-center">
            <p className="text-gray-500 text-lg">
              No rides available right now
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">

            {rides.map((ride) => (

              <div
                key={ride.id}
                className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition"
              >

                <h2 className="text-xl font-semibold mb-4">
                  Ride #{ride.id}
                </h2>

                <div className="space-y-2 text-gray-700">

                  <p>
                    📍 <strong>Pickup:</strong> {ride.pickup_location}
                  </p>

                  <p>
                    🏁 <strong>Drop:</strong> {ride.drop_location}
                  </p>

                  <p>
                    ⚖️ <strong>Load:</strong> {ride.load_weight} tons
                  </p>

                </div>

                <button
                  onClick={() => acceptRide(ride.id)}
                  className="mt-5 w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Accept Ride
                </button>

              </div>

            ))}

          </div>
        )}

      </div>

    </Layout>
  );
}