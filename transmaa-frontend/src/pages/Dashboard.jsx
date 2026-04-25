import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

export default function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    API
      .get("/protected")
      .then(async (response) => {
        const role = response.data.role;

        if (role === "admin") navigate("/admin");
        else if (role === "user") navigate("/user");
        else if (role === "driver") {
          try {
            await API.get("/drivers/dashboard");
            navigate("/driver");
          } catch {
            navigate("/verify-driver");
          }
        }
      })
      .catch(() => {
        localStorage.removeItem("token");
        navigate("/login");
      });
  }, [navigate]);

  return <div className="p-10">Loading Dashboard...</div>;
}
