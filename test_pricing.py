import requests
import json

url = "http://localhost:8000/api/pricing/calculate"
data = {
    "origin_pincode": "110001",
    "destination_pincode": "400001",
    "weight_kg": 5.0,
    "shipment_type": "parcel",
    "service_type": "standard"
}
try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
