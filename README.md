# Transmaa-AI-Smart-Logistics-Management-System
AI-powered logistics platform for smart shipment tracking, driver management and dispatch optimization.

## Backend DB
This project now uses MongoDB.

Required `.env` values:

```env
MONGODB_URL=mongodb://127.0.0.1:27017
MONGODB_DB=transmaa
SECRET_KEY=supersecretkey
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Payments (Razorpay)
PAYMENT_PROVIDER=razorpay
PAYMENT_CURRENCY=INR
PAYMENT_SIMULATION_ENABLED=true
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxx
```

Run backend:

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```
