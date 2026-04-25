import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";

export default function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const formData = new URLSearchParams();
      formData.append("username", normalizedEmail);
      formData.append("password", password);

      const response = await API.post(
        "/auth/login",
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
      alert("Invalid credentials");
    } finally {
      setIsSubmitting(false);
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
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition"
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>

        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <hr className="flex-grow border-gray-300"/>
          <span className="px-2 text-gray-400 text-sm">OR</span>
          <hr className="flex-grow border-gray-300"/>
        </div>

        {/* Account Links */}

        <div className="flex flex-col gap-2 text-center">

          <Link
            to="/register"
            className="text-blue-600 hover:underline"
          >
            Register
          </Link>

          <Link
            to="/forgot-password"
            className="text-gray-600 hover:underline"
          >
            Forgot Password?
          </Link>

        </div>

      </div>

    </div>

  );
}
