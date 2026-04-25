import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("");
    setResetUrl("");
    setResetToken("");
    setLoading(true);

    try {
      const response = await API.post("/auth/forgot-password", { email });
      const data = response.data || {};
      setStatus(data.message || "If an account exists, a reset link has been sent.");
      if (data.reset_url) {
        setResetUrl(data.reset_url);
      }
      if (data.reset_token) {
        setResetToken(data.reset_token);
      }
    } catch (error) {
      console.log(error.response?.data);
      setStatus("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-3">Forgot Password</h1>
        <p className="text-gray-600 mb-6">
          Enter your email to receive a password reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <input
            type="email"
            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {status ? (
          <div className="mt-5 text-sm text-gray-700">
            {status}
          </div>
        ) : null}

        {resetUrl ? (
          <div className="mt-4 text-sm">
            <a className="text-blue-600 hover:underline" href={resetUrl}>
              Open reset page
            </a>
          </div>
        ) : null}

        {resetToken ? (
          <div className="mt-2 text-xs text-gray-500">
            Debug token: <span className="font-mono break-all">{resetToken}</span>
          </div>
        ) : null}

        <div className="mt-6">
          <Link to="/login" className="text-blue-600 hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
