import { useState } from "react";
import axios from "axios";
import Layout from "../components/Layout";

export default function UserDashboard() {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [weight, setWeight] = useState("");
  const token = localStorage.getItem("token");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await axios.post(
        "http://127.0.0.1:8000/rides/request",
        {
          pickup_location: pickup,
          drop_location: drop,
          load_weight: parseFloat(weight),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Ride Requested Successfully 🚛");
    } catch {
      alert("Error booking ride");
    }
  };

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-6">🚛 Book Ride</h1>

      <form onSubmit={handleSubmit} className="space-y-4">

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
    </Layout>
  );
}