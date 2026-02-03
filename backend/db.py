import mysql.connector

db = mysql.connector.connect(
    host="localhost",
    user="billuser",
    password="Bill@1234",
    database="billreminder"
)
cursor = db.cursor(dictionary=True)
