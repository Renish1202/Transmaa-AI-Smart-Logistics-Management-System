import { useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");

    axios
      .get("http://127.0.0.1:8000/protected", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((response) => {
        const role = response.data.role;

        if (role === "admin") navigate("/admin");
        else if (role === "driver") navigate("/driver");
        else if (role === "user") navigate("/user");
      })
      .catch(() => {
        localStorage.removeItem("token");
        navigate("/");
      });
  }, [navigate]);

  return <div className="p-10">Loading Dashboard...</div>;
}