from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from dotenv import load_dotenv
from bson.objectid import ObjectId
from bson import json_util
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime

from services.ai_service import (
    classify_bill,
    compute_spending_metrics,
    generate_ai_response,
    generate_insights,
    get_smart_reminder_days,
)

# Load environment variables
load_dotenv()

app = Flask(__name__)

# CORS configuration (Allow Netlify + Localhost)
CORS(
    app,
    resources={r"/*": {"origins": [
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501",
        "http://127.0.0.1:5502",
        "http://localhost:5500",
        "http://localhost:5501",
        "http://localhost:5502",
        "https://billmatex.netlify.app"
    ]}},
    supports_credentials=True
)

# MongoDB Connection
MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI is not set in environment variables")

client = MongoClient(MONGO_URI)

db = client["billmate"]
users_collection = db["users"]
bills_collection = db["bills"]

EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")


# ---------------- HEALTH CHECK ----------------
@app.route("/")
def home():
    return jsonify({"message": "BillMate backend running successfully"})


# ---------------- SIGNUP ----------------
@app.route("/signup", methods=["POST"])
def signup():
    try:
        data = request.json

        existing_user = users_collection.find_one({"email": data["email"]})
        if existing_user:
            return jsonify({"message": "User already exists"}), 400

        hashed_password = generate_password_hash(data["password"])

        user_data = {
            "name": data["name"],
            "email": data["email"],
            "password": hashed_password
        }

        users_collection.insert_one(user_data)

        return jsonify({"message": "Signup successful"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- LOGIN ----------------
@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.json

        user = users_collection.find_one({"email": data["email"]})

        if user and check_password_hash(user["password"], data["password"]):
            return jsonify({
                "message": "Login successful",
                "username": user["name"],
                "email": user["email"]
            }), 200

        return jsonify({"message": "Invalid credentials"}), 401

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- GET ALL BILLS ----------------
@app.route("/api/bills", methods=["GET"])
def get_bills():
    try:
        # Fetch all bills from MongoDB
        bills_cursor = bills_collection.find()
        bills = list(bills_cursor)

        # Use bson.json_util to safely serialize ObjectId and other BSON types
        bills_json = json_util.dumps(bills)

        return app.response_class(bills_json, mimetype="application/json")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- ADD BILL ----------------
@app.route("/api/bills", methods=["POST"])
def add_bill():
    try:
        data = request.json

        raw_text = (data or {}).get("text") or (data or {}).get("raw_text")
        ai_result = {"title": "", "category": "Other"}
        if raw_text:
            ai_result = classify_bill(raw_text)

        bill_name = (data or {}).get("name") or ai_result["title"]
        bill_category = (data or {}).get("category") or ai_result["category"]
        user_id = (data or {}).get("user_id")
        user_email = (data or {}).get("user_email")

        if not bill_name or not data.get("amount") or not data.get("date"):
            return jsonify({"error": "name/title, amount, and date are required"}), 400

        reminder_days_before = get_smart_reminder_days(user_id, bills_collection)

        bill = {
            "name": bill_name,
            "amount": data["amount"],
            "category": bill_category,
            "date": data["date"],
            "status": data.get("status", "Unpaid"),
            "user_id": user_id,
            "user_email": user_email,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "reminder_days_before": reminder_days_before
        }

        result = bills_collection.insert_one(bill)

        bill["_id"] = str(result.inserted_id)

        return jsonify(bill), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- SEND IMMEDIATE ALERT EMAIL ----------------
@app.route("/api/bills/send-immediate-alert", methods=["POST"])
def send_immediate_alert():
    try:
        if not EMAIL_USER or not EMAIL_PASS:
            return jsonify({"error": "Email credentials not configured on server"}), 500

        data = request.json or {}
        recipient = data.get("email")
        alerts = data.get("alerts", [])

        if not recipient or not alerts:
            return jsonify({"error": "Missing email or alerts"}), 400

        subject = "BillMate – Important bill alerts"
        body = "Here are your most urgent bill reminders:\n\n" + "\n".join(f"- {a}" for a in alerts)

        msg = MIMEMultipart()
        msg["From"] = EMAIL_USER
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, [recipient], msg.as_string())

        return jsonify({"message": "Alert email sent"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- UPDATE BILL ----------------
@app.route("/api/bills/<id>", methods=["PUT"])
def update_bill(id):
    try:
        bill = bills_collection.find_one({"_id": ObjectId(id)})

        if not bill:
            return jsonify({"message": "Bill not found"}), 404

        new_status = "Paid" if bill["status"] == "Unpaid" else "Unpaid"

        update_data = {"status": new_status, "updated_at": datetime.utcnow()}
        if new_status == "Paid":
            update_data["paid_date"] = datetime.utcnow()
        else:
            update_data["paid_date"] = None

        bills_collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": update_data}
        )

        return jsonify({"message": "Bill updated"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- DELETE BILL ----------------
@app.route("/api/bills/<id>", methods=["DELETE"])
def delete_bill(id):
    try:
        bills_collection.delete_one({"_id": ObjectId(id)})

        return jsonify({"message": "Bill deleted"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- CONTACT FORM (LANDING PAGE) ----------------
@app.route("/contact", methods=["POST"])
def contact():
    try:
        if not EMAIL_USER or not EMAIL_PASS:
            return jsonify({"error": "Email credentials not configured on server"}), 500

        data = request.json or {}
        name = data.get("name", "Visitor")
        email = data.get("email", "no-email-provided")
        message = data.get("message", "").strip()

        if not message:
            return jsonify({"error": "Message cannot be empty"}), 400

        subject = "New BillMate contact request"
        body = f"New contact request from BillMate landing page:\n\nName: {name}\nEmail: {email}\n\nMessage:\n{message}"

        msg = MIMEMultipart()
        msg["From"] = EMAIL_USER
        msg["To"] = "pk2525507@gmail.com"
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, ["pk2525507@gmail.com"], msg.as_string())

        return jsonify({"message": "Contact message sent"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- AI CHAT ASSISTANT ----------------
@app.route("/api/ai/chat", methods=["POST"])
@app.route("/ai/chat", methods=["POST"])
def ai_chat():
    try:
        data = request.json or {}
        query = str(data.get("query", "")).strip()
        if not query:
            return jsonify({"error": "query is required"}), 400

        user_id = data.get("user_id")
        user_email = data.get("user_email")
        db_query = {}
        if user_id:
            db_query["user_id"] = user_id
        elif user_email:
            db_query["user_email"] = user_email

        bills = list(bills_collection.find(db_query))
        answer = generate_ai_response(query, bills)
        return jsonify({"response": answer}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- AI INSIGHTS ----------------
@app.route("/api/ai/insights", methods=["GET"])
@app.route("/ai/insights", methods=["GET"])
def ai_insights():
    try:
        user_id = request.args.get("user_id")
        user_email = request.args.get("user_email")

        db_query = {}
        if user_id:
            db_query["user_id"] = user_id
        elif user_email:
            db_query["user_email"] = user_email

        bills = list(bills_collection.find(db_query))
        metrics = compute_spending_metrics(bills)
        insight_text = generate_insights(metrics)

        return jsonify({
            "monthly_total": metrics["monthly_total"],
            "category_spending": metrics["category_spending"],
            "insight": insight_text
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------- RUN SERVER ----------------
if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)