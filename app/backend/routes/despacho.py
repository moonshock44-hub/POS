"""Dispatch tickets — path /api/despacho (F10 / JUA-20). NOT /api/deliveries."""
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from models.dispatch_ticket import DispatchTicketPublic, DispatchTicketUpdate
from routes.auth import get_db, require_despacho_access

router = APIRouter(prefix="/despacho", tags=["despacho"])


def _ticket_oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket de despacho no encontrado",
        )
    return ObjectId(id_str)


@router.get("", response_model=List[DispatchTicketPublic])
async def list_dispatch_tickets(
    request: Request,
    _user=Depends(require_despacho_access),
    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
        description="Filter by status: pending|ready",
    ),
):
    """List dispatch tickets. Optional ?status=pending|ready. Newest first."""
    db = get_db(request)
    query: dict = {}
    if status_filter is not None and status_filter != "":
        allowed = {"pending", "ready"}
        if status_filter not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status inválido (pending|ready)",
            )
        query["status"] = status_filter
    cursor = db.dispatch_tickets.find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=10_000)
    return [DispatchTicketPublic.from_doc(d) for d in docs]


@router.get("/{ticket_id}", response_model=DispatchTicketPublic)
async def get_dispatch_ticket(
    ticket_id: str,
    request: Request,
    _user=Depends(require_despacho_access),
):
    db = get_db(request)
    doc = await db.dispatch_tickets.find_one({"_id": _ticket_oid(ticket_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket de despacho no encontrado",
        )
    return DispatchTicketPublic.from_doc(doc)


@router.patch("/{ticket_id}", response_model=DispatchTicketPublic)
async def patch_dispatch_ticket(
    ticket_id: str,
    body: DispatchTicketUpdate,
    request: Request,
    _user=Depends(require_despacho_access),
):
    """Update ticket status to pending|ready."""
    db = get_db(request)
    oid = _ticket_oid(ticket_id)
    existing = await db.dispatch_tickets.find_one({"_id": oid})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket de despacho no encontrado",
        )
    now = datetime.now(timezone.utc)
    await db.dispatch_tickets.update_one(
        {"_id": oid},
        {"$set": {"status": body.status, "updated_at": now}},
    )
    doc = await db.dispatch_tickets.find_one({"_id": oid})
    return DispatchTicketPublic.from_doc(doc)
