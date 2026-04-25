import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DriverRegister from "./pages/DriverRegister";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SupportChat from "./pages/SupportChat";
import UserDashboard from "./pages/UserDashboard";
import DriverDashboard from "./pages/DriverDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import UserPaymentHistory from "./pages/UserPaymentHistory";
import DriverPaymentHistory from "./pages/DriverPaymentHistory";

import PrivateRoute from "./components/PrivateRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/support"
          element={
            <PrivateRoute>
              <SupportChat />
            </PrivateRoute>
          }
        />
        <Route
          path="/driver-register"
          element={
            <PrivateRoute allowedRoles={["driver"]}>
              <DriverRegister />
            </PrivateRoute>
          }
        />
        <Route
          path="/verify-driver"
          element={
            <PrivateRoute allowedRoles={["driver"]}>
              <DriverRegister />
            </PrivateRoute>
          }
        />

        <Route
          path="/user"
          element={
            <PrivateRoute allowedRoles={["user"]}>
              <UserDashboard />
            </PrivateRoute>
          }
        />

        <Route
          path="/driver"
          element={
            <PrivateRoute allowedRoles={["driver"]}>
              <DriverDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/driver/payments"
          element={
            <PrivateRoute allowedRoles={["driver"]}>
              <DriverPaymentHistory />
            </PrivateRoute>
          }
        />

        <Route
          path="/user/payments"
          element={
            <PrivateRoute allowedRoles={["user"]}>
              <UserPaymentHistory />
            </PrivateRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <PrivateRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
