import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {

      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await axios.post(
        "http://127.0.0.1:8000/auth/login",
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      localStorage.setItem("token", response.data.access_token);

      const payload = JSON.parse(
        atob(response.data.access_token.split(".")[1])
      );

      localStorage.setItem("role", payload.role);
      localStorage.setItem("email", payload.sub);

      navigate("/dashboard");

    } catch (error) {
      console.log(error.response?.data);
      alert("Invalid credentials");
    }
  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-100 to-indigo-200">

      <div className="bg-white p-10 rounded-2xl shadow-xl w-96">

        {/* Logo / Brand */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-blue-600">TRANSMAA</h1>
          <p className="text-gray-500 text-sm">
            Smart Transport Management
          </p>
        </div>

        {/* Login Title */}
        <h2 className="text-xl font-semibold mb-6 text-center">
          Login to your account
        </h2>

        <form onSubmit={handleLogin} className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition"
          >
            Login
          </button>

        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <hr className="flex-grow border-gray-300"/>
          <span className="px-2 text-gray-400 text-sm">OR</span>
          <hr className="flex-grow border-gray-300"/>
        </div>

        {/* Register Links */}

        <div className="flex flex-col gap-2 text-center">

          <Link
            to="/register"
            className="text-blue-600 hover:underline"
          >
            Register as Passenger
          </Link>

          <Link
            to="/driver-register"
            className="text-green-600 hover:underline"
          >
            Register as Driver
          </Link>

        </div>

      </div>

    </div>

  );
}