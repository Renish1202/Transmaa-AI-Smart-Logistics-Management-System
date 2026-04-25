import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

export default function UserPaymentHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    API.get("/payments/my-ride-payments")
      .then((res) => {
        const data = res.data || [];
        setRows(data);
        const nextDrafts = {};
        data.forEach((row) => {
          nextDrafts[row.id] = {
            rating: Number(row.user_rating || 5),
            review: String(row.user_review || ""),
          };
        });
        setDrafts(nextDrafts);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const formatAmount = (amount, currency = "INR") =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const setDraftValue = (id, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        rating: Number(prev[id]?.rating || 5),
        review: String(prev[id]?.review || ""),
        [key]: value,
      },
    }));
  };

  const saveReview = async (id) => {
    const draft = drafts[id] || { rating: 5, review: "" };
    setSavingId(id);
    try {
      await API.put(`/payments/my-ride-payments/${id}/review`, {
        rating: Number(draft.rating || 5),
        review: String(draft.review || "").trim(),
      });
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                user_rating: Number(draft.rating || 5),
                user_review: String(draft.review || "").trim(),
              }
            : row
        )
      );
      alert("Review saved");
    } catch (error) {
      alert(error.response?.data?.detail || "Unable to save review");
    } finally {
      setSavingId(null);
    }
  };

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
                Driver: {row.driver_email || row.driver_id || "N/A"}
              </p>
              <div className="mt-2 border-t pt-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">Rate Driver & Add Review</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDraftValue(row.id, "rating", star)}
                      className={`h-8 w-8 rounded-full text-sm font-semibold ${
                        Number(drafts[row.id]?.rating || 5) >= star
                          ? "bg-amber-400 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {star}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  maxLength={500}
                  className="w-full border rounded p-2 text-sm"
                  placeholder="Write your review about driver..."
                  value={drafts[row.id]?.review || ""}
                  onChange={(e) => setDraftValue(row.id, "review", e.target.value)}
                />
                <button
                  type="button"
                  disabled={savingId === row.id}
                  onClick={() => saveReview(row.id)}
                  className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
                >
                  {savingId === row.id ? "Saving..." : "Save Review"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
