import os
import sqlite3
import bcrypt
from pydantic import BaseModel
from jose import jwt
from datetime import datetime, timedelta

# Configuración de base de datos
# Utiliza el mismo directorio CHROMA_DIR para asegurar la persistencia en Hugging Face Spaces
CHROMA_DIR = os.environ.get("CHROMA_DIR", os.path.join(os.path.dirname(__file__), "..", "chroma_db"))
os.makedirs(CHROMA_DIR, exist_ok=True)
DB_PATH = os.path.join(CHROMA_DIR, "users.db")

# Configuración de Hashes y JWT
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "un_secreto_super_seguro_para_actaobraia_123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

class User(BaseModel):
    username: str
    company_id: str

class UserInDB(User):
    hashed_password: str

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            company_id TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def get_user(username: str) -> UserInDB | None:
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT username, hashed_password, company_id FROM users WHERE username = ?", (username,))
    row = c.fetchone()
    conn.close()
    if row:
        return UserInDB(**dict(row))
    return None

def authenticate_user(username: str, password: str):
    user = get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
