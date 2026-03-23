import os
import sys

# Añadir ruta del directorio padre para importar backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.auth import init_db, get_db_connection, get_password_hash

def populate_db():
    print("Inicializando base de datos SQLite de usuarios...")
    init_db()
    
    conn = get_db_connection()
    c = conn.cursor()
    
    users_to_add = [
        ("empresaA", get_password_hash("1234"), "company_A"),
        ("empresaB", get_password_hash("1234"), "company_B")
    ]
    
    for username, hashed_pwd, company_id in users_to_add:
        try:
            c.execute("INSERT INTO users (username, hashed_password, company_id) VALUES (?, ?, ?)", 
                      (username, hashed_pwd, company_id))
            print(f"Usuario creado [Username: {username} | Empresa: {company_id}]")
        except sqlite3.IntegrityError:
            print(f"El usuario '{username}' ya existe.")
        except Exception as e:
            # Ignoramos sqlite3 NameError temporal al correr como script
            if "UNIQUE constraint failed" in str(e):
                print(f"El usuario '{username}' ya existe.")
            else:
                print(e)
            
    conn.commit()
    conn.close()
    print("Población completada. Base de datos lista en CHROMA_DIR.")

if __name__ == "__main__":
    populate_db()
