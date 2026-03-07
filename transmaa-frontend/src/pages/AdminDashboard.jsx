import { useEffect, useState } from "react";
import axios from "axios";
import Layout from "../components/Layout";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    axios
      .get("http://127.0.0.1:8000/admin/dashboard", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => setStats(res.data))
      .catch((err) => console.log(err));
  }, [token]);

  if (!stats) return <Layout>Loading...</Layout>;

  const rideData = [
    { name: "Total Rides", value: stats.total_rides },
    { name: "Completed", value: stats.completed_rides },
  ];

  const userDriverData = [
    { name: "Users", value: stats.total_users },
    { name: "Drivers", value: stats.total_drivers },
  ];

  const COLORS = ["#3b82f6", "#10b981"];

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-8">📊 Admin Analytics</h1>

      <div className="grid md:grid-cols-2 gap-8">

        {/* Bar Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            Ride Overview
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rideData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            Users vs Drivers
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={userDriverData}
                dataKey="value"
                nameKey="name"
                outerRadius={100}
                label
              >
                {userDriverData.map((entry, index) => (
                  <Cell key={index} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>
    </Layout>
  );
}