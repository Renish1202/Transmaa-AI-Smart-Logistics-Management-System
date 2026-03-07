import { useState } from "react";
import axios from "axios";
import Layout from "../components/Layout";

export default function DriverRegister() {

  const token = localStorage.getItem("token");

  const [form, setForm] = useState({
    dl_number: "",
    pan_number: "",
    vehicle_number: "",
    vehicle_type: "",
    capacity_tons: "",
    dl_image: "",
    rc_image: "",
    vehicle_image: ""
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {

      await axios.post(
        "http://127.0.0.1:8000/drivers/register",   // API
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`      // TOKEN
          }
        }
      );

      alert("Driver Registered Successfully 🚛");

    } catch (error) {
      console.log(error);
      alert("Registration Failed");
    }
  };

  return (
    <Layout>

      <div className="max-w-xl mx-auto bg-white p-6 rounded shadow">

        <h1 className="text-2xl font-bold mb-6">
          🚛 Driver Registration
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">

          <input
            type="text"
            name="dl_number"
            placeholder="Driving License Number"
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />

          <input
            type="text"
            name="pan_number"
            placeholder="PAN Number"
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />

          <input
            type="text"
            name="vehicle_number"
            placeholder="Vehicle Number"
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />

          <input
            type="text"
            name="vehicle_type"
            placeholder="Vehicle Type (Truck / Mini Truck)"
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />

          <input
            type="number"
            name="capacity_tons"
            placeholder="Truck Capacity (Tons)"
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />

          <input
            type="text"
            name="dl_image"
            placeholder="DL Image URL"
            onChange={handleChange}
            className="w-full border p-2 rounded"
          />

          <input
            type="text"
            name="rc_image"
            placeholder="RC Image URL"
            onChange={handleChange}
            className="w-full border p-2 rounded"
          />

          <input
            type="text"
            name="vehicle_image"
            placeholder="Vehicle Image URL"
            onChange={handleChange}
            className="w-full border p-2 rounded"
          />

          <button
            type="submit"
            className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"
          >
            Register Driver
          </button>

        </form>

      </div>

    </Layout>
  );
}