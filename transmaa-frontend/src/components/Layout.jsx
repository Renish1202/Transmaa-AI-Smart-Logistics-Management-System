import { useNavigate } from "react-router-dom";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const role = localStorage.getItem("role");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* Sidebar */}
      <div className="w-64 bg-blue-700 text-white flex flex-col">
        <div className="p-6 text-2xl font-bold border-b border-blue-500">
          🚛 Transmaa
        </div>

        <nav className="flex-1 p-4 space-y-4">

          {role === "admin" && (
            <>
              <button
                onClick={() => navigate("/admin")}
                className="block w-full text-left hover:bg-blue-600 p-2 rounded"
              >
                Dashboard
              </button>

              <button
                onClick={() => navigate("/admin/users")}
                className="block w-full text-left hover:bg-blue-600 p-2 rounded"
              >
                Manage Users
              </button>
            </>
          )}

          {role === "driver" && (
            <>
              <button
                onClick={() => navigate("/driver")}
                className="block w-full text-left hover:bg-blue-600 p-2 rounded"
              >
                My Rides
              </button>
              <button
                onClick={() => navigate("/verify-driver")}
                className="block w-full text-left hover:bg-blue-600 p-2 rounded"
              >
                Driver KYC
              </button>
            </>
          )}

          {role === "user" && (
            <>
              <button
                onClick={() => navigate("/user")}
                className="block w-full text-left hover:bg-blue-600 p-2 rounded"
              >
                Book Ride
              </button>
            </>
          )}

          <button
            onClick={() => navigate("/support")}
            className="block w-full text-left hover:bg-blue-600 p-2 rounded"
          >
            Support Chat
          </button>

        </nav>

        <div className="p-4 border-t border-blue-500">
          <button
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 p-2 rounded"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="bg-white shadow-md rounded-lg p-6">
          {children}
        </div>
      </div>

    </div>
  );
}
