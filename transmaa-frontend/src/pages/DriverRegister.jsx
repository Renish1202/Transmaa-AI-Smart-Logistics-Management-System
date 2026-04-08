import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import API from "../services/api";

export default function DriverRegister() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    dl_number: "",
    pan_number: "",
    vehicle_number: "",
    vehicle_type: "",
    capacity_tons: "",
    dl_image: null,
    rc_image: null,
    vehicle_image: null,
  });
  const [statusMessage, setStatusMessage] = useState("");
  const apiBaseUrl = API.defaults.baseURL || "";

  const fileUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${apiBaseUrl}/${normalized}`;
  };

  const loadProfile = async () => {
    try {
      const res = await API.get("/drivers/me");
      const data = res.data || null;
      setProfile(data);
      if (data) {
        setForm((prev) => ({
          ...prev,
          dl_number: data.dl_number || "",
          pan_number: data.pan_number || "",
          vehicle_number: data.vehicle_number || "",
          vehicle_type: data.vehicle_type || "",
          capacity_tons: data.capacity_tons || "",
        }));
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.log(error);
      }
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleChange = (e) => {
    const { name, type, value, files } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "file" ? files[0] : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage("");

    try {
      const formData = new FormData();
      formData.append("dl_number", form.dl_number);
      formData.append("pan_number", form.pan_number);
      formData.append("vehicle_number", form.vehicle_number);
      formData.append("vehicle_type", form.vehicle_type);
      formData.append("capacity_tons", form.capacity_tons);
      formData.append("dl_image", form.dl_image);
      formData.append("rc_image", form.rc_image);
      formData.append("vehicle_image", form.vehicle_image);

      const response = await API.post("/drivers/register", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setStatusMessage(
        response.data?.message ||
          "Your details have been sent to admin for verification."
      );
      await loadProfile();
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed";
      alert(message);
    }
  };

  const isApproved = profile?.verification_status === "approved";
  const isRejected = profile?.verification_status === "rejected";
  const isPending = profile?.verification_status === "pending";

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Driver KYC</h1>
            <p className="text-sm text-gray-500">Identity and vehicle verification</p>
          </div>
          {profile?.verification_status ? (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isApproved ? "bg-emerald-100 text-emerald-700" : isRejected ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
              {profile.verification_status}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="bg-white p-6 rounded shadow text-gray-500">Loading KYC status...</div>
        ) : null}

        {!loading && isApproved ? (
          <div className="bg-white p-6 rounded shadow space-y-4">
            <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              your registeration is successfully done
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">Profile Details</h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-semibold text-gray-800">Driver ID:</span> {profile.id}</p>
                  <p><span className="font-semibold text-gray-800">DL Number:</span> {profile.dl_number}</p>
                  <p><span className="font-semibold text-gray-800">PAN Number:</span> {profile.pan_number}</p>
                </div>
              </div>
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-800">Truck Details</h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="font-semibold text-gray-800">Vehicle Number:</span> {profile.vehicle_number}</p>
                  <p><span className="font-semibold text-gray-800">Vehicle Type:</span> {profile.vehicle_type}</p>
                  <p><span className="font-semibold text-gray-800">Capacity:</span> {profile.capacity_tons} tons</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {profile.dl_image ? (
                <a className="border rounded-lg p-4 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100" href={fileUrl(profile.dl_image)} target="_blank" rel="noreferrer">
                  View Driving License
                </a>
              ) : null}
              {profile.rc_image ? (
                <a className="border rounded-lg p-4 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100" href={fileUrl(profile.rc_image)} target="_blank" rel="noreferrer">
                  View RC Document
                </a>
              ) : null}
              {profile.vehicle_image ? (
                <a className="border rounded-lg p-4 bg-slate-50 text-sm text-slate-700 hover:bg-slate-100" href={fileUrl(profile.vehicle_image)} target="_blank" rel="noreferrer">
                  View Vehicle Image
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && isPending ? (
          <div className="bg-white p-6 rounded shadow">
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your registration is under review. We will notify you once it is approved.
            </div>
          </div>
        ) : null}

        {!loading && isRejected ? (
          <div className="bg-white p-6 rounded shadow space-y-4">
            <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              your registeration is rejected please try again
            </div>
            {statusMessage ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {statusMessage}
              </div>
            ) : null}
            <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                name="dl_number"
                placeholder="Driving License Number"
                value={form.dl_number}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="pan_number"
                placeholder="PAN Number"
                value={form.pan_number}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="vehicle_number"
                placeholder="Vehicle Number"
                value={form.vehicle_number}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="vehicle_type"
                placeholder="Vehicle Type (Truck / Mini Truck)"
                value={form.vehicle_type}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="number"
                name="capacity_tons"
                placeholder="Truck Capacity (Tons)"
                value={form.capacity_tons}
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <div className="md:col-span-2 grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Driving License Image
                  </label>
                  <input
                    type="file"
                    name="dl_image"
                    accept="image/*,.pdf"
                    onChange={handleChange}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    RC Image
                  </label>
                  <input
                    type="file"
                    name="rc_image"
                    accept="image/*,.pdf"
                    onChange={handleChange}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Vehicle Image
                  </label>
                  <input
                    type="file"
                    name="vehicle_image"
                    accept="image/*"
                    onChange={handleChange}
                    className="w-full border p-2 rounded"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="md:col-span-2 w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"
              >
                Resubmit KYC
              </button>
            </form>
          </div>
        ) : null}

        {!loading && !profile ? (
          <div className="bg-white p-6 rounded shadow">
            {statusMessage ? (
              <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {statusMessage}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                name="dl_number"
                placeholder="Driving License Number"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="pan_number"
                placeholder="PAN Number"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="vehicle_number"
                placeholder="Vehicle Number"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="text"
                name="vehicle_type"
                placeholder="Vehicle Type (Truck / Mini Truck)"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <input
                type="number"
                name="capacity_tons"
                placeholder="Truck Capacity (Tons)"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <label className="block text-sm font-medium text-gray-700">
                Driving License Image
              </label>
              <input
                type="file"
                name="dl_image"
                accept="image/*,.pdf"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <label className="block text-sm font-medium text-gray-700">
                RC Image
              </label>
              <input
                type="file"
                name="rc_image"
                accept="image/*,.pdf"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <label className="block text-sm font-medium text-gray-700">
                Vehicle Image
              </label>
              <input
                type="file"
                name="vehicle_image"
                accept="image/*"
                onChange={handleChange}
                className="w-full border p-2 rounded"
                required
              />

              <button
                type="submit"
                className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"
              >
                Register Driver
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
