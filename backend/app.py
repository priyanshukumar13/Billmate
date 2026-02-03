from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from db import db, cursor

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return "BillReminder backend running successfully!"

@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    print("🔥 SIGNUP HIT 🔥")
    print("DATA RECEIVED:", data)

    hashed = generate_password_hash(data["password"])
    cursor.execute(
        "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
        (data["name"], data["email"], hashed)
    )
    db.commit()

    print("✅USER INSERTED")

    return jsonify({"message": "Signup successful"}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.json
    cursor.execute("SELECT * FROM users WHERE email=%s", (data["email"],))
    user = cursor.fetchone()
    if user and check_password_hash(user["password"], data["password"]):
        return jsonify({"message": "Login successful"}), 200
    return jsonify({"message": "Invalid credentials"}), 401

if __name__ == "__main__":
    app.run(debug=True)
