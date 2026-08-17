import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.recycling_rewards import (
    PointsLedgerEntry,
    Reward,
    RewardRedemption,
    RewardRule,
)
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/rewards", tags=["rewards"])


class RewardRuleCreateRequest(BaseModel):
    activity_type: str = Field(min_length=2, max_length=64)
    points: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)


class RewardCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    points_cost: int = Field(gt=0)
    stock: int | None = Field(default=None, ge=0)


class RedeemRequest(BaseModel):
    reward_id: uuid.UUID


@router.post("/rules", status_code=201)
def create_reward_rule(
    payload: RewardRuleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    existing = db.query(RewardRule).filter(RewardRule.activity_type == payload.activity_type).first()
    if existing:
        raise HTTPException(status_code=409, detail="Rule already exists for this activity type")
    rule = RewardRule(activity_type=payload.activity_type, points=payload.points, description=payload.description)
    db.add(rule)
    db.commit()
    return {"id": str(rule.id), "activity_type": rule.activity_type, "points": rule.points}


@router.get("/rules")
def list_reward_rules(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rules = db.query(RewardRule).filter(RewardRule.is_active.is_(True)).all()
    return [{"activity_type": r.activity_type, "points": r.points, "description": r.description} for r in rules]


@router.post("/catalog", status_code=201)
def create_reward(
    payload: RewardCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    reward = Reward(name=payload.name, description=payload.description, points_cost=payload.points_cost, stock=payload.stock)
    db.add(reward)
    db.commit()
    return {"id": str(reward.id), "name": reward.name, "points_cost": reward.points_cost}


@router.get("/catalog")
def list_rewards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rewards = db.query(Reward).filter(Reward.is_active.is_(True)).all()
    return [
        {"id": str(r.id), "name": r.name, "description": r.description, "points_cost": r.points_cost, "stock": r.stock}
        for r in rewards
    ]


@router.get("/balance")
def my_points_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total = db.query(func.coalesce(func.sum(PointsLedgerEntry.points), 0)).filter(
        PointsLedgerEntry.user_id == current_user.id
    ).scalar()
    return {"user_id": str(current_user.id), "points_balance": total}


@router.get("/history")
def my_points_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    entries = (
        db.query(PointsLedgerEntry)
        .filter(PointsLedgerEntry.user_id == current_user.id)
        .order_by(PointsLedgerEntry.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {"activity_type": e.activity_type, "points": e.points, "note": e.note, "created_at": e.created_at.isoformat()}
        for e in entries
    ]


@router.post("/redeem", status_code=201)
def redeem_reward(payload: RedeemRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reward = db.get(Reward, payload.reward_id)
    if not reward or not reward.is_active:
        raise HTTPException(status_code=404, detail="Reward not found")
    if reward.stock is not None and reward.stock <= 0:
        raise HTTPException(status_code=409, detail="Reward is out of stock")

    balance = db.query(func.coalesce(func.sum(PointsLedgerEntry.points), 0)).filter(
        PointsLedgerEntry.user_id == current_user.id
    ).scalar()
    if balance < reward.points_cost:
        raise HTTPException(status_code=422, detail="Insufficient points balance")

    redemption = RewardRedemption(
        user_id=current_user.id, reward_id=reward.id, points_spent=reward.points_cost, status="PENDING"
    )
    db.add(redemption)
    db.add(
        PointsLedgerEntry(
            user_id=current_user.id,
            activity_type="REDEMPTION",
            points=-reward.points_cost,
            reference_id=reward.id,
            note=f"Redeemed: {reward.name}",
        )
    )
    if reward.stock is not None:
        reward.stock -= 1
    db.commit()
    db.refresh(redemption)
    return {"id": str(redemption.id), "reward": reward.name, "points_spent": redemption.points_spent, "status": redemption.status}


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Real leaderboard computed from the points ledger — no hardcoded rankings."""
    rows = (
        db.query(PointsLedgerEntry.user_id, func.sum(PointsLedgerEntry.points).label("total"))
        .group_by(PointsLedgerEntry.user_id)
        .order_by(func.sum(PointsLedgerEntry.points).desc())
        .limit(20)
        .all()
    )
    out = []
    for user_id, total in rows:
        user = db.get(User, user_id)
        out.append({"user_id": str(user_id), "name": user.full_name if user else "Unknown", "points": total})
    return out
