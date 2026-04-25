import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

export default function DriverPaymentHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get("/payments/driver/ride-payments")
      .then((res) => setRows(res.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const formatAmount = (amount, currency = "INR") =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-6">Payment History</h1>
      {loading ? (
        <p className="text-gray-500">Loading payment history...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No completed ride payments found yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="border rounded-lg p-4 flex flex-col gap-2">
              <p className="font-semibold">Payment #{row.id}</p>
              <p className="text-sm text-gray-600">
                Ride #{row.ride_id} | {row.pickup_location || "-"} {"\u2192"} {row.drop_location || "-"}
              </p>
              <p className="text-sm text-gray-500">
                Method: {String(row.method || "cash").toUpperCase()} | Status: {String(row.status || "pending").toUpperCase()}
              </p>
              <p className="text-sm text-gray-700 font-semibold">
                Ride Price: {formatAmount(row.amount ?? row.ride_price ?? 0, row.currency || row.ride_price_currency || "INR")}
              </p>
              <p className="text-xs text-gray-500">
                Customer: {row.user_email || row.user_id || "N/A"}
              </p>
              <div className="mt-2 border-t pt-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">Customer Review & Star Rating</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`h-8 w-8 rounded-full text-sm font-semibold inline-flex items-center justify-center ${
                        Number(row.user_rating || 0) >= star
                          ? "bg-amber-400 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {star}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-slate-600">
                  {row.user_review ? row.user_review : "No review submitted yet."}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
