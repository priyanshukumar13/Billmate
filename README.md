
# 📑 BillMate – Smart Bill Reminder & Expense Tracker

BillMate is a **full-stack web application** that helps users manage bills, track expenses, and receive **real-time alerts** so they never miss a due date.  
It combines a modern frontend dashboard with a secure backend and real authentication.


🚀 Project Overview
BillMate allows users to:
- Create an account and log in securely
- Add, update, and track bills
- Analyze expenses with charts
- Get real-time alerts for upcoming or overdue bills


🛠️ Tech Stack
### Frontend
- HTML5  
- CSS3  
- JavaScript (Vanilla)  
- Chart.js  
- AOS (Animate On Scroll)

⚙️ Backend
- Python (Flask)  
- SQLite (Database)  
- Flask-JWT-Extended (Authentication)  
- Flask-SocketIO (Real-time alerts)  
- APScheduler (Background scheduler)  
- Flask-CORS  



 📁 Project Structure

```

billmate/
│
├── backend/
│   ├── app.py
│   ├── database.db
│   ├── requirements.txt
│   │
│   ├── models/
│   │   ├── user.py
│   │   └── bill.py
│   │
│   ├── routes/
│   │   ├── auth.py
│   │   └── bills.py
│   │
│   └── utils/
│       └── scheduler.py
│
└── frontend/
├── index.html
├── login.html
├── signup.html
├── dashboard.html
├── calendar.html
├── expenses.html
├── settings.html
├── *.js
├── *.css
└── assets/

````


## ⚙️ Backend Setup

1️⃣ Create Virtual Environment
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
````

2️⃣ Install Dependencies
```bash
pip install -r requirements.txt
```

3️⃣ Run Backend Server
```bash
python app.py
```

⚙️Backend runs at:
```
http://localhost:5000
```


🎨 Frontend Setup

1. Open the `frontend` folder in **VS Code**
2. Use **Live Server**
3. Open in browser:

```
http://127.0.0.1:5500/frontend/index.html
```

🔐 Authentication Flow
1. User signs up with email & password
2. Password is **hashed** before storing in database
3. User logs in
4. Backend generates a **JWT token**
5. Token is stored on frontend
6. Token is sent with every API request
7. Protected routes are accessible only with valid token



🌐 API Endpoints
 Authentication
```
POST /api/auth/signup
POST /api/auth/login
```

📑 Bills
```
GET    /api/bills
POST   /api/bills
PUT    /api/bills/<id>
DELETE /api/bills/<id>
```


## 🔔 Real-Time Alerts (How It Works)
* A background scheduler runs every minute
* It checks for unpaid bills
* If a bill is due or overdue:
  * Backend emits a WebSocket event
  * Frontend instantly receives the alert
* No page refresh required

This system is extendable to:
* Email notifications
* SMS alerts
* Push notifications


## 📈 Future Enhancements
* Email alerts (Gmail / SMTP)
* SMS alerts (Twilio)
* Push notifications
* Recurring bills
* Multi-currency support
* Cloud deployment (AWS / Render / Railway)
* Mobile app (React Native)


👨‍💻 Author
**Priyanshu Kumar**
🎓 B.Tech CSE | Full-Stack & Cloud Enthusiast
🏫 Lovely Professional University


🔗 Live Demo  
https://billmatex.netlify.app/


* GitHub: [https://github.com/priyanshukumar13](https://github.com/priyanshukumar13)
* LinkedIn: [https://www.linkedin.com/in/priyanshu-kumar-2523672a2](https://www.linkedin.com/in/priyanshu-kumar-2523672a2)

⭐ Contributing
Contributions are welcome!

1. Fork the repository
2. Create a new branch
3. Commit your changes
4. Open a Pull Request


📄 License
This project is licensed under the **MIT License**.


**BillMate – Never miss a bill again.**
Built for learning, scaling, and real-world use 🚀

```

---

### ✅ You now have:
- One **single file**
- Clean structure
- Backend & frontend setup
- Auth flow
- API endpoints
- Real-time alerts
- Future scope
- Author, contributing & license

If you want next:
- 📦 Production deployment guide  
- 🧪 Postman API collection  
- 🖼️ Screenshot section  
- ☁️ AWS hosting steps  

Just tell me 👊
```
