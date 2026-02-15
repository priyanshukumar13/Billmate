from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

# MongoDB Connection
MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client["billmate"]
users_collection = db["users"]

@app.route("/")
def home():
    return "BillMate backend running with MongoDB!"

# ---------------- SIGNUP ----------------
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json

    # check if user exists
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


# ---------------- LOGIN ----------------
@app.route("/login", methods=["POST"])
def login():
    data = request.json

    user = users_collection.find_one({"email": data["email"]})

    if user and check_password_hash(user["password"], data["password"]):
        return jsonify({"message": "Login successful"}), 200

    return jsonify({"message": "Invalid credentials"}), 401


if __name__ == "__main__":
    app.run(debug=True)
