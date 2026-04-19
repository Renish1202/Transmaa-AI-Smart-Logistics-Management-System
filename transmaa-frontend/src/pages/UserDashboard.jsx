import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function UserDashboard() {
  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [weight, setWeight] = useState("");
  const [rides, setRides] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState({ enabled: false, simulation_enabled: false, provider: "razorpay" });
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);

  const loadMyRides = () => {
    API.get("/rides/my").then((res) => setRides(res.data)).catch(() => setRides([]));
  };

  const loadMyInvoices = () => {
    API.get("/payments/my-invoices").then((res) => setInvoices(res.data || [])).catch(() => setInvoices([]));
  };

  const loadPaymentConfig = () => {
    API.get("/payments/config")
      .then((res) => setPaymentConfig(res.data || { enabled: false, simulation_enabled: false, provider: "razorpay" }))
      .catch(() => setPaymentConfig({ enabled: false, simulation_enabled: false, provider: "razorpay" }));
  };

  useEffect(() => {
    loadMyRides();
    loadMyInvoices();
    loadPaymentConfig();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await API.post("/rides/request", {
        pickup_location: pickup,
        drop_location: drop,
        load_weight: parseFloat(weight),
      });

      setPickup("");
      setDrop("");
      setWeight("");
      loadMyRides();
      alert("Ride requested successfully.");
    } catch {
      alert("Error booking ride");
    }
  };

  const cancelRide = async (rideId) => {
    try {
      await API.put(`/rides/cancel/${rideId}`);
      loadMyRides();
    } catch (error) {
      alert(error.response?.data?.detail || "Unable to cancel");
    }
  };

  const formatAmount = (amount, currency = "INR") =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));

  const canPay = paymentConfig.enabled || paymentConfig.simulation_enabled;

  const payInvoice = async (invoice) => {
    if (!canPay) {
      alert("Payments are currently disabled. Please contact support.");
      return;
    }

    setPayingInvoiceId(invoice.id);
    let checkoutOpened = false;

    try {
      const orderRes = await API.post(`/payments/invoices/${invoice.id}/create-order`);
      const order = orderRes.data;

      if (order.simulate_mode) {
        await API.post(`/payments/invoices/${invoice.id}/simulate-success`);
        await loadMyInvoices();
        alert("Payment completed in simulation mode.");
        return;
      }

      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        throw new Error("Unable to load Razorpay checkout");
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Transmaa Logistics",
        description: `Invoice #${invoice.id}`,
        order_id: order.order_id,
        prefill: {
          email: localStorage.getItem("email") || "",
        },
        handler: async (response) => {
          try {
            await API.post(`/payments/invoices/${invoice.id}/verify`, response);
            await loadMyInvoices();
            alert("Payment successful.");
          } catch (error) {
            alert(error.response?.data?.detail || "Payment verification failed");
          } finally {
            setPayingInvoiceId(null);
          }
        },
        modal: {
          ondismiss: () => setPayingInvoiceId(null),
        },
        theme: {
          color: "#1d4ed8",
        },
      };

      checkoutOpened = true;
      const razorpay = new window.Razorpay(options);
      razorpay.on("payment.failed", (response) => {
        alert(response.error?.description || "Payment failed");
        setPayingInvoiceId(null);
      });
      razorpay.open();
    } catch (error) {
      alert(error.response?.data?.detail || error.message || "Unable to start payment");
    } finally {
      if (!checkoutOpened) {
        setPayingInvoiceId(null);
      }
    }
  };

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-6">Book Ride</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <input
          type="text"
          placeholder="Pickup Location"
          className="w-full p-3 border rounded"
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          required
        />

        <input
          type="text"
          placeholder="Drop Location"
          className="w-full p-3 border rounded"
          value={drop}
          onChange={(e) => setDrop(e.target.value)}
          required
        />

        <input
          type="number"
          placeholder="Load Weight (tons)"
          className="w-full p-3 border rounded"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          required
        />

        <button className="bg-blue-600 text-white p-3 rounded w-full">
          Request Ride
        </button>
      </form>

      <h2 className="text-2xl font-semibold mb-4">My Rides</h2>
      <div className="space-y-3">
        {rides.length === 0 ? (
          <p className="text-gray-500">No rides yet.</p>
        ) : (
          rides.map((ride) => (
            <div key={ride.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">Ride #{ride.id}</p>
                <p className="text-sm text-gray-600">
                  {ride.pickup_location} {"\u2192"} {ride.drop_location}
                </p>
                <p className="text-sm text-gray-500">Status: {ride.status}</p>
              </div>
              {(ride.status === "requested" || ride.status === "accepted") && (
                <button
                  onClick={() => cancelRide(ride.id)}
                  className="px-3 py-2 bg-rose-500 text-white rounded"
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <h2 className="text-2xl font-semibold mt-10 mb-4">My Invoices & Payments</h2>
      {!canPay && (
        <p className="text-sm text-rose-600 mb-3">
          Payment gateway is unavailable right now. Please contact support.
        </p>
      )}
      {paymentConfig.enabled && paymentConfig.provider === "razorpay" && (
        <p className="text-sm text-emerald-700 mb-3">Secure checkout is enabled.</p>
      )}
      {!paymentConfig.enabled && paymentConfig.simulation_enabled && (
        <p className="text-sm text-amber-700 mb-3">
          Running in simulation mode. Payments are mocked for development.
        </p>
      )}

      <div className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-gray-500">No invoices assigned to your account yet.</p>
        ) : (
          invoices.map((invoice) => {
            const amount = Number(invoice.balance_amount ?? invoice.amount ?? 0);
            const isPaid = invoice.status === "paid" || invoice.payment_status === "paid";
            const isPending = invoice.status === "pending";
            const statusClass = isPaid
              ? "bg-emerald-100 text-emerald-700"
              : isPending
                ? "bg-amber-100 text-amber-700"
                : "bg-rose-100 text-rose-700";

            return (
              <div key={invoice.id} className="border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">Invoice #{invoice.id}</p>
                  <p className="text-sm text-gray-600">Load #{invoice.load_id} | Due: {invoice.due_date || "N/A"}</p>
                  <p className="text-sm text-gray-700 mt-1">
                    Amount: {formatAmount(amount, invoice.currency || "INR")}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusClass}`}>
                    {(invoice.status || "pending").toUpperCase()}
                  </span>
                  <button
                    onClick={() => payInvoice(invoice)}
                    disabled={isPaid || !canPay || payingInvoiceId === invoice.id}
                    className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                  >
                    {isPaid ? "Paid" : payingInvoiceId === invoice.id ? "Processing..." : "Pay Now"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
