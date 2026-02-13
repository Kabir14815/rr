import requests
import sys

BASE_URL = "http://localhost:8000/api"
ADMIN_EMAIL = "admin@rrenterprise.com"
ADMIN_PASSWORD = "admin123"

def test_users_list():
    print(f"Logging in as {ADMIN_EMAIL}...")
    try:
        resp = requests.post(f"{BASE_URL}/auth/login", data={
            "username": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        resp.raise_for_status()
        token = resp.json()["access_token"]
        print("Login success.")
    except Exception as e:
        print(f"Login failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}
    
    print("Fetching users list...")
    try:
        resp = requests.get(f"{BASE_URL}/auth/admin/users", headers=headers)
        if resp.status_code != 200:
            print(f"Error fetching users: Status {resp.status_code}")
            print(f"Response: {resp.text}")
            sys.exit(1)
            
        users = resp.json()
        print(f"Success! Found {len(users)} users.")
        for user in users[:3]:
            print(f" - {user.get('full_name')} (Rule: {user.get('pricing_rule_id')})")
            
    except Exception as e:
        print(f"Exception listing users: {e}")

if __name__ == "__main__":
    test_users_list()
