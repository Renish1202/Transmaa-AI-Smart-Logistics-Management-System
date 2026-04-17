import { useState } from "react";
import API from "../services/api";
import { useNavigate, Link } from "react-router-dom";

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
    phone: "",
    role: "user",
    admin_code: ""
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      email: form.email.trim().toLowerCase(),
      phone: form.phone?.trim() || "",
      admin_code: form.role === "admin" ? form.admin_code.trim() : undefined,
    };

    try {
      await API.post("/auth/register", payload);
    } catch (error) {
      console.log("register error", error);
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail)) {
        alert(detail.map((item) => item.msg).join("\n"));
      } else if (typeof detail === "string") {
        alert(detail);
      } else if (error.message) {
        alert(`Registration failed: ${error.message}`);
      } else {
        alert("Registration failed");
      }
      return;
    }

    try {
      const loginData = new URLSearchParams();
      loginData.append("username", payload.email);
      loginData.append("password", payload.password);

      const response = await API.post("/auth/login", loginData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      localStorage.setItem("token", response.data.access_token);

      const tokenPayload = JSON.parse(atob(response.data.access_token.split(".")[1]));
      localStorage.setItem("role", tokenPayload.role);
      localStorage.setItem("email", tokenPayload.sub);

      alert("Registered successfully!");

      if (tokenPayload.role === "driver") {
        navigate("/verify-driver");
      } else if (tokenPayload.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/user");
      }
    } catch (error) {
      console.log("auto-login error", error);
      const detail = error.response?.data?.detail;
      if (typeof detail === "string") {
        alert(`Registered, but login failed: ${detail}`);
      } else if (error.message) {
        alert(`Registered, but login failed: ${error.message}`);
      } else {
        alert("Registered, but login failed. Please login manually.");
      }
      navigate("/");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg w-96">

        <h2 className="text-2xl font-bold mb-6 text-center">
          Register
        </h2>

        <input
          name="email"
          type="email"
          placeholder="Email"
          onChange={handleChange}
          className="w-full mb-3 p-2 border rounded"
          required
        />

        <input
          name="phone"
          type="tel"
          placeholder="Phone"
          onChange={handleChange}
          className="w-full mb-3 p-2 border rounded"
        />

        <input
          name="password"
          type="password"
          placeholder="Password"
          onChange={handleChange}
          className="w-full mb-3 p-2 border rounded"
          minLength={8}
          required
        />

        <select
          name="role"
          onChange={handleChange}
          className="w-full mb-3 p-2 border rounded"
          required
        >
          <option value="user">User</option>
          <option value="driver">Driver</option>
          <option value="admin">Admin</option>
        </select>

        {form.role === "admin" && (
          <input
            name="admin_code"
            type="password"
            placeholder="Admin access code"
            onChange={handleChange}
            className="w-full mb-3 p-2 border rounded"
            required
          />
        )}

        <button className="w-full bg-blue-500 text-white p-2 rounded">
          Register
        </button>

        <p className="mt-4 text-center">
          Already have account?{" "}
          <Link to="/" className="text-blue-500">
            Login
          </Link>
        </p>

      </form>
    </div>
  );
}

export default Register;
