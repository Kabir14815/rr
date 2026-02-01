from fastapi import APIRouter, HTTPException, status, Depends, Response
from fastapi.responses import StreamingResponse
from typing import List, Optional
from bson import ObjectId
from datetime import datetime, date, timedelta
from io import BytesIO
import pandas as pd
from ..database import db_helper
from ..models.consignment import (
    ConsignmentCreate, ConsignmentResponse, ConsignmentUpdate, ConsignmentZone
)
from ..models.shipment import ShipmentStatus, ShipmentType, Address, TrackingEvent
from ..models.invoice import PaymentStatus
from ..models.user import TokenData
from ..utils.auth import require_admin
from ..utils.helpers import generate_invoice_number

router = APIRouter(prefix="/api/consignments", tags=["Consignments"])


def generate_consignment_number() -> str:
    """Generate a unique consignment number."""
    timestamp = datetime.utcnow().strftime("%d%m%y%H%M")
    return f"DXOO{timestamp}"


def generate_tracking_number() -> str:
    """Generate a unique tracking number for shipments."""
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"RR{timestamp}"


async def get_next_sr_no() -> int:
    """Get the next serial number."""
    db = db_helper.db
    last_doc = await db.consignments.find_one(
        sort=[("sr_no", -1)]
    )
    return (last_doc.get("sr_no", 0) + 1) if last_doc else 1


async def get_user_pricing_rule(user_id: str, zone: str):
    """Get user's pricing rule or fall back to zone-based pricing."""
    db = db_helper.db
    
    # First, try to get user's assigned pricing rule
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user and user.get("pricing_rule_id"):
        rule = await db.pricing_rules.find_one({"_id": ObjectId(user["pricing_rule_id"])})
        if rule and rule.get("is_active", True):
            return rule
    
    # Fall back to zone-based pricing rule
    zone_lower = zone.lower() if zone else "local"
    rule = await db.pricing_rules.find_one({
        "zone": zone_lower,
        "is_active": True
    })
    return rule


async def create_shipment_for_consignment(consignment_dict: dict, user: dict, token_data):
    """Auto-create a shipment when a consignment is created."""
    db = db_helper.db
    
    # Build origin address from user
    origin = {
        "name": user.get("full_name", ""),
        "phone": user.get("phone", ""),
        "address_line1": user.get("address", ""),
        "city": user.get("city", ""),
        "state": user.get("state", ""),
        "pincode": user.get("pincode", ""),
        "country": "India"
    }
    
    # Build destination address from consignment
    destination = {
        "name": consignment_dict.get("name", "Consignee"),
        "phone": "",
        "address_line1": consignment_dict.get("destination", ""),
        "city": consignment_dict.get("destination_city", consignment_dict.get("destination", "")),
        "state": consignment_dict.get("destination_state", ""),
        "pincode": consignment_dict.get("destination_pincode", ""),
        "country": "India"
    }
    
    # Determine shipment type based on weight
    weight = consignment_dict.get("weight", 0)
    if weight <= 0.5:
        shipment_type = ShipmentType.DOCUMENT.value
    elif weight <= 5:
        shipment_type = ShipmentType.PARCEL.value
    else:
        shipment_type = ShipmentType.FREIGHT.value
    
    # Create shipment document
    shipment = {
        "tracking_number": generate_tracking_number(),
        "customer_id": consignment_dict.get("user_id", ""),
        "shipment_type": shipment_type,
        "origin": origin,
        "destination": destination,
        "weight_kg": weight,
        "declared_value": consignment_dict.get("value", 0),
        "description": consignment_dict.get("product_name", ""),
        "status": ShipmentStatus.PENDING.value,
        "tracking_history": [{
            "status": ShipmentStatus.PENDING.value,
            "location": user.get("city", "Origin"),
            "timestamp": datetime.utcnow(),
            "description": "Shipment created from consignment",
            "updated_by": token_data.user_id
        }],
        "pricing": {
            "base_rate": consignment_dict.get("base_rate", 0),
            "docket_charges": consignment_dict.get("docket_charges", 0),
            "oda_charge": consignment_dict.get("oda_charge", 0),
            "fov": consignment_dict.get("fov", 0),
            "total": consignment_dict.get("total", 0)
        },
        "consignment_id": None,  # Will update after consignment is saved
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "created_by": token_data.user_id
    }
    
    result = await db.shipments.insert_one(shipment)
    return str(result.inserted_id), shipment["tracking_number"]


async def create_invoice_for_consignment(
    consignment_dict: dict, 
    user: dict, 
    shipment_id: str,
    tracking_number: str,
    token_data
) -> tuple:
    """Auto-create an invoice when a consignment is created."""
    db = db_helper.db
    
    # Calculate totals
    base_rate = consignment_dict.get("base_rate", 0)
    docket_charges = consignment_dict.get("docket_charges", 0)
    oda_charge = consignment_dict.get("oda_charge", 0)
    fov = consignment_dict.get("fov", 0)
    fuel_charge = consignment_dict.get("fuel_charge", 0)
    gst_percent = consignment_dict.get("gst", 18)
    
    # Calculate subtotal
    subtotal = base_rate + docket_charges + oda_charge + fov
    
    # Apply fuel charge percentage
    fuel_amount = subtotal * (fuel_charge / 100) if fuel_charge else 0
    subtotal_with_fuel = subtotal + fuel_amount
    
    # Apply GST
    gst_amount = subtotal_with_fuel * (gst_percent / 100)
    total_amount = subtotal_with_fuel + gst_amount
    
    # Create invoice item
    items = [{
        "shipment_id": shipment_id or "",
        "tracking_number": tracking_number or "",
        "description": f"Consignment - {consignment_dict.get('product_name', 'Package')} to {consignment_dict.get('destination', 'Destination')}",
        "weight_kg": float(consignment_dict.get("weight", 0)),
        "amount": round(subtotal_with_fuel, 2)
    }]
    
    # Create invoice
    invoice = {
        "invoice_number": generate_invoice_number(),
        "customer_id": consignment_dict.get("user_id", ""),
        "customer_name": user.get("full_name", consignment_dict.get("name", "Customer")),
        "customer_email": user.get("email", ""),
        "billing_address": f"{user.get('address', '')}, {user.get('city', '')}, {user.get('state', '')} - {user.get('pincode', '')}",
        "shipment_ids": [shipment_id] if shipment_id else [],
        "items": items,
        "subtotal": round(subtotal_with_fuel, 2),
        "gst_amount": round(gst_amount, 2),
        "total_amount": round(total_amount, 2),
        "amount_paid": 0,
        "balance_due": round(total_amount, 2),
        "payment_status": PaymentStatus.PENDING.value,
        "payments": [],
        "due_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "notes": f"Auto-generated invoice for consignment {consignment_dict.get('consignment_no', '')}",
        "created_at": datetime.utcnow(),
        "created_by": token_data.user_id
    }
    
    result = await db.invoices.insert_one(invoice)
    invoice_id = str(result.inserted_id)
    
    # Update shipment with invoice_id
    if shipment_id:
        await db.shipments.update_one(
            {"_id": ObjectId(shipment_id)},
            {"$set": {"invoice_id": invoice_id}}
        )
    
    return invoice_id, invoice["invoice_number"]

@router.post("/", response_model=ConsignmentResponse)
async def create_consignment(
    consignment: ConsignmentCreate,
    token_data: TokenData = Depends(require_admin)
):
    """Create a new consignment entry with auto-shipment creation (Admin only)."""
    db = db_helper.db
    
    consignment_dict = consignment.model_dump()
    
    # Get user details if user_id is provided
    user = None
    if consignment_dict.get("user_id"):
        try:
            user = await db.users.find_one({"_id": ObjectId(consignment_dict["user_id"])})
            if user:
                # Update name from user if not explicitly set
                if not consignment_dict.get("name") or consignment_dict["name"] == "":
                    consignment_dict["name"] = user.get("full_name", "")
                
                # Apply user's pricing rule if rates are not manually set
                if consignment_dict.get("base_rate", 0) == 0:
                    pricing_rule = await get_user_pricing_rule(
                        consignment_dict["user_id"],
                        consignment_dict.get("zone", "LOCAL")
                    )
                    if pricing_rule:
                        weight = consignment_dict.get("weight", 0)
                        consignment_dict["base_rate"] = pricing_rule.get("base_rate", 0)
                        # Calculate per-kg charges
                        per_kg_rate = pricing_rule.get("per_kg_rate", 0)
                        min_weight = pricing_rule.get("min_weight_kg", 0.5)
                        chargeable_weight = max(weight, min_weight)
                        consignment_dict["base_rate"] += per_kg_rate * chargeable_weight
        except Exception:
            pass  # Invalid user_id, continue without user
    
    consignment_dict["sr_no"] = await get_next_sr_no()
    consignment_dict["consignment_no"] = generate_consignment_number()
    consignment_dict["total"] = (
        consignment_dict.get("base_rate", 0) + 
        consignment_dict.get("docket_charges", 0) + 
        consignment_dict.get("oda_charge", 0) + 
        consignment_dict.get("fov", 0)
    )
    consignment_dict["date"] = consignment_dict["date"].isoformat()
    consignment_dict["created_at"] = datetime.utcnow()
    consignment_dict["updated_at"] = datetime.utcnow()
    consignment_dict["created_by"] = token_data.user_id
    
    # Auto-create shipment if user is linked
    shipment_id = None
    tracking_number = None
    if user and consignment_dict.get("user_id"):
        try:
            shipment_id, tracking_number = await create_shipment_for_consignment(
                consignment_dict, user, token_data
            )
            consignment_dict["shipment_id"] = shipment_id
        except Exception as e:
            # Log error but don't fail consignment creation
            print(f"Failed to create shipment: {e}")
    
    result = await db.consignments.insert_one(consignment_dict)
    consignment_dict["_id"] = str(result.inserted_id)
    
    # Update shipment with consignment_id
    if shipment_id:
        await db.shipments.update_one(
            {"_id": ObjectId(shipment_id)},
            {"$set": {"consignment_id": str(result.inserted_id)}}
        )
    
    # Auto-create invoice if user is linked
    invoice_id = None
    if user and consignment_dict.get("user_id"):
        try:
            invoice_id, invoice_number = await create_invoice_for_consignment(
                consignment_dict, user, shipment_id, tracking_number or "", token_data
            )
            consignment_dict["invoice_id"] = invoice_id
            consignment_dict["invoice_no"] = invoice_number
            
            # Update consignment with invoice reference
            await db.consignments.update_one(
                {"_id": result.inserted_id},
                {"$set": {"invoice_id": invoice_id, "invoice_no": invoice_number}}
            )
        except Exception as e:
            # Log error but don't fail consignment creation
            print(f"Failed to create invoice: {e}")
    
    return ConsignmentResponse(**consignment_dict)


@router.get("/", response_model=List[ConsignmentResponse])
async def list_consignments(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    zone: Optional[ConsignmentZone] = None,
    user_id: Optional[str] = None,
    token_data: TokenData = Depends(require_admin)
):
    """List all consignments with optional filters (Admin only)."""
    db = db_helper.db
    
    query = {}
    
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    if zone:
        query["zone"] = zone
    
    if user_id:
        query["user_id"] = user_id
    
    cursor = db.consignments.find(query).sort("sr_no", -1).skip(skip).limit(limit)
    consignments = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        consignments.append(ConsignmentResponse(**doc))
    
    return consignments


@router.get("/by-user/{user_id}", response_model=List[ConsignmentResponse])
async def get_consignments_by_user(
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    token_data: TokenData = Depends(require_admin)
):
    """Get all consignments for a specific user."""
    db = db_helper.db
    
    cursor = db.consignments.find({"user_id": user_id}).sort("sr_no", -1).skip(skip).limit(limit)
    consignments = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        consignments.append(ConsignmentResponse(**doc))
    
    return consignments


@router.get("/by-invoice/{invoice_id}", response_model=List[ConsignmentResponse])
async def get_consignments_by_invoice(
    invoice_id: str,
    skip: int = 0,
    limit: int = 100,
    token_data: TokenData = Depends(require_admin)
):
    """Get all consignments for a specific invoice."""
    db = db_helper.db
    
    cursor = db.consignments.find({"invoice_id": invoice_id}).sort("sr_no", -1).skip(skip).limit(limit)
    consignments = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        consignments.append(ConsignmentResponse(**doc))
    
    return consignments


@router.get("/{consignment_id}", response_model=ConsignmentResponse)
async def get_consignment(
    consignment_id: str,
    token_data: TokenData = Depends(require_admin)
):
    """Get a single consignment by ID."""
    db = db_helper.db
    
    doc = await db.consignments.find_one({"_id": ObjectId(consignment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Consignment not found")
    
    doc["_id"] = str(doc["_id"])
    return ConsignmentResponse(**doc)


@router.put("/{consignment_id}", response_model=ConsignmentResponse)
async def update_consignment(
    consignment_id: str,
    update: ConsignmentUpdate,
    token_data: TokenData = Depends(require_admin)
):
    """Update a consignment entry (Admin only)."""
    db = db_helper.db
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    if update_data:
        # Convert date to string if present
        if "date" in update_data and update_data["date"]:
            update_data["date"] = update_data["date"].isoformat()
        
        # Recalculate total if any rate fields changed
        doc = await db.consignments.find_one({"_id": ObjectId(consignment_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Consignment not found")
        
        base = update_data.get("base_rate", doc.get("base_rate", 0))
        docket = update_data.get("docket_charges", doc.get("docket_charges", 0))
        oda = update_data.get("oda_charge", doc.get("oda_charge", 0))
        fov = update_data.get("fov", doc.get("fov", 0))
        update_data["total"] = base + docket + oda + fov
        update_data["updated_at"] = datetime.utcnow()
        
        await db.consignments.update_one(
            {"_id": ObjectId(consignment_id)},
            {"$set": update_data}
        )
    
    doc = await db.consignments.find_one({"_id": ObjectId(consignment_id)})
    doc["_id"] = str(doc["_id"])
    return ConsignmentResponse(**doc)


@router.delete("/{consignment_id}")
async def delete_consignment(
    consignment_id: str,
    token_data: TokenData = Depends(require_admin)
):
    """Delete a consignment entry (Admin only)."""
    db = db_helper.db
    
    result = await db.consignments.delete_one({"_id": ObjectId(consignment_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Consignment not found")
    
    return {"message": "Consignment deleted"}


@router.get("/export/excel")
async def export_consignments_excel(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ids: Optional[str] = None,
    token_data: TokenData = Depends(require_admin)
):
    """Export consignments to Excel (Admin only)."""
    db = db_helper.db
    
    query = {}
    if ids:
        obj_ids = [ObjectId(id.strip()) for id in ids.split(",") if id.strip()]
        query["_id"] = {"$in": obj_ids}
    elif start_date and end_date:
        # Only use date filter if no specific IDs are requested
        query["date"] = {"$gte": start_date, "$lte": end_date}
    
    cursor = db.consignments.find(query).sort("sr_no", 1)
    
    data = []
    async for doc in cursor:
        data.append({
            "SR NO": doc.get("sr_no"),
            "DATE": doc.get("date"),
            "CONSIGNMENT NO": doc.get("consignment_no"),
            "NAME": doc.get("name"),
            "USER ID": doc.get("user_id", ""),
            "DESTINATION": doc.get("destination"),
            "PIECES": doc.get("pieces"),
            "WEIGHT": doc.get("weight"),
            "PRODUCT NAME": doc.get("product_name"),
            "INVOICE NO": doc.get("invoice_no", ""),
            "ZONE": doc.get("zone"),
            "BASE RATE": doc.get("base_rate"),
            "DOCKET CHARGES": doc.get("docket_charges"),
            "ODA CHARGE": doc.get("oda_charge"),
            "FOV": doc.get("fov"),
            "VALUE": doc.get("value"),
            "TOTAL": doc.get("total"),
            "SHIPMENT ID": doc.get("shipment_id", ""),
            "BOX 1 L*B*H": doc.get("box1_dimensions", ""),
            "BOX 2 L*B*H": doc.get("box2_dimensions", ""),
            "BOX 3 L*B*H": doc.get("box3_dimensions", ""),
        })
    
    df = pd.DataFrame(data)
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Consignments')
    output.seek(0)
    
    filename = f"consignments_{datetime.utcnow().strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
