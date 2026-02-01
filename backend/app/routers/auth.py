from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from bson import ObjectId
from ..database import db_helper
from ..config import settings
from ..models.user import (
    UserCreate, UserResponse, UserUpdate, UserInDB, 
    UserRole, Token
)
from ..utils.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user_token, require_admin, require_master_admin
)
from ..models.user import TokenData

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    """Register a new user (customer by default)."""
    db = db_helper.db
    
    # Check if email exists
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user document
    user_dict = user.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["role"] = UserRole.CUSTOMER  # Force customer role for public registration
    user_dict["permissions"] = []
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    
    return UserResponse(**user_dict)


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login and get access token."""
    db = db_helper.db
    
    user = await db.users.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    
    access_token = create_access_token(
        data={"sub": str(user["_id"]), "role": user["role"]}
    )
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user(token_data: TokenData = Depends(get_current_user_token)):
    """Get current user profile."""
    db = db_helper.db
    
    user = await db.users.find_one({"_id": ObjectId(token_data.user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user["_id"] = str(user["_id"])
    return UserResponse(**user)


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    update: UserUpdate,
    token_data: TokenData = Depends(get_current_user_token)
):
    """Update current user profile."""
    db = db_helper.db
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.users.update_one(
            {"_id": ObjectId(token_data.user_id)},
            {"$set": update_data}
        )
    
    user = await db.users.find_one({"_id": ObjectId(token_data.user_id)})
    user["_id"] = str(user["_id"])
    return UserResponse(**user)


# Admin endpoints for user management
@router.post("/admin/create-user", response_model=UserResponse)
async def create_user_admin(
    user: UserCreate,
    token_data: TokenData = Depends(require_master_admin)
):
    """Create a user with any role (Master Admin only)."""
    db = db_helper.db
    
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user_dict = user.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["permissions"] = []
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(user_dict)
    user_dict["_id"] = str(result.inserted_id)
    
    return UserResponse(**user_dict)


@router.get("/admin/users", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 50,
    token_data: TokenData = Depends(require_admin)
):
    """List all users (Admin only)."""
    db = db_helper.db
    
    cursor = db.users.find().skip(skip).limit(limit)
    users = []
    async for user in cursor:
        try:
            user["_id"] = str(user["_id"])
            # Add default values for new fields if they don't exist
            user.setdefault("address", None)
            user.setdefault("city", None)
            user.setdefault("state", None)
            user.setdefault("pincode", None)
            user.setdefault("pricing_rule_id", None)
            users.append(UserResponse(**user))
        except Exception as e:
            print(f"Error processing user {user.get('email', 'unknown')}: {e}")
            # Continue processing other users or re-raise?
            # If we Skip, the client gets a partial list. If we re-raise, 500.
            # Let's skip bad records for now to allow viewing the list.
            continue
    
    return users
