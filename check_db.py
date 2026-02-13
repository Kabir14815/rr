from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import json

MONGODB_URL = "mongodb+srv://Task:1234@cluster0.lnxh7gs.mongodb.net/rr_enterprise?retryWrites=true&w=majority"
DB_NAME = "rr_enterprise"

async def check_data():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("Shipments:")
    async for s in db.shipments.find():
        print(f" - {s.get('tracking_number')}")
        
    print("\nConsignments:")
    async for c in db.consignments.find():
        print(f" - {c.get('consignment_no')} (Invoice: {c.get('invoice_no')})")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_data())
