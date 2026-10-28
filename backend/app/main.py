import logging
from decimal import Decimal
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.coros_oauth import router as coros_router
from app.database import get_db
from app.models import Bike, BikeRide, Component, MaintenanceRecord, Shoe, ShoeAssessment, ShoeRun
from app.schemas import (
    BikeCreate,
    BikeOut,
    BikeRideCreate,
    BikeRideOut,
    ComponentCreate,
    ComponentOut,
    ComponentUpdate,
    Dashboard,
    MaintenanceCreate,
    MaintenanceOut,
    ShoeAssessmentCreate,
    ShoeAssessmentOut,
    ShoeCreate,
    ShoeOut,
    ShoeRunCreate,
    ShoeRunOut,
    ShoeStats,
    BikeUpdate,
    ShoeUpdate,
)

app = FastAPI(title="GearTrack API", version="1.0.0", description="Suivi de maintenance vélo et d'usure des chaussures.")
logger = logging.getLogger(__name__)
if settings.coros_enabled:
    app.include_router(coros_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def required(model, entity_id: int, db: Session):
    entity = db.get(model, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Élément introuvable.")
    return entity


def apply_update(entity, payload, required_fields: set[str]):
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in required_fields and value is None:
            raise HTTPException(status_code=422, detail=f"Le champ « {key} » ne peut pas être vide.")
        setattr(entity, key, value)


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        logger.warning("Database health check failed")
        raise HTTPException(
            status_code=503,
            detail={"status": "unavailable"},
        ) from error
    return {"status": "ok"}


@app.get("/api/dashboard", response_model=Dashboard)
def dashboard(db: Session = Depends(get_db)):
    bikes = db.scalars(select(Bike)).all()
    shoes = db.scalars(select(Shoe)).all()
    bike_km = db.scalar(select(func.coalesce(func.sum(BikeRide.distance_km), 0))) or Decimal(0)
    shoe_km = db.scalar(select(func.coalesce(func.sum(ShoeRun.distance_km), 0))) or Decimal(0)

    due = []
    for component in db.scalars(select(Component).where(Component.maintenance_interval_km.is_not(None))).all():
        last = db.scalar(
            select(MaintenanceRecord)
            .where(MaintenanceRecord.component_id == component.id)
            .order_by(MaintenanceRecord.bike_km.desc(), MaintenanceRecord.performed_on.desc())
            .limit(1)
        )
        due_km = (last.bike_km if last else component.installed_km) + component.maintenance_interval_km
        ridden_distance = db.scalar(
            select(func.coalesce(func.sum(BikeRide.distance_km), 0)).where(BikeRide.bike_id == component.bike_id)
        ) or Decimal(0)
        bike_distance = component.bike.current_odometer_km + ridden_distance
        due.append({
            "component_id": component.id,
            "component": component.name,
            "bike_id": component.bike_id,
            "bike": component.bike.name,
            "due_at_km": float(due_km),
            "current_km": float(bike_distance),
            "overdue": bike_distance >= due_km,
        })
    due.sort(key=lambda item: (not item["overdue"], item["due_at_km"] - item["current_km"]))

    activities = []
    for ride in db.scalars(select(BikeRide).order_by(BikeRide.occurred_on.desc(), BikeRide.id.desc()).limit(8)).all():
        activities.append({"date": ride.occurred_on, "kind": "Vélo", "label": ride.bike.name, "detail": f"{ride.distance_km} km"})
    for run in db.scalars(select(ShoeRun).order_by(ShoeRun.occurred_on.desc(), ShoeRun.id.desc()).limit(8)).all():
        activities.append({"date": run.occurred_on, "kind": "Course", "label": run.shoe.name, "detail": f"{run.distance_km} km"})
    for record in db.scalars(select(MaintenanceRecord).order_by(MaintenanceRecord.performed_on.desc(), MaintenanceRecord.id.desc()).limit(8)).all():
        activities.append({"date": record.performed_on, "kind": "Entretien", "label": record.bike.name, "detail": record.operation})
    activities.sort(key=lambda item: item["date"], reverse=True)

    return Dashboard(
        bike_count=len(bikes),
        shoe_count=len(shoes),
        total_km=bike_km + shoe_km,
        bike_km=bike_km,
        running_km=shoe_km,
        activity_count=(
            db.scalar(select(func.count()).select_from(BikeRide)) or 0
        ) + (db.scalar(select(func.count()).select_from(ShoeRun)) or 0),
        upcoming_maintenance=due[:8],
        recent_activities=activities[:8],
    )


@app.get("/api/bikes", response_model=list[BikeOut])
def list_bikes(db: Session = Depends(get_db)):
    return db.scalars(select(Bike).order_by(Bike.name)).all()


@app.post("/api/bikes", response_model=BikeOut, status_code=status.HTTP_201_CREATED)
def create_bike(payload: BikeCreate, db: Session = Depends(get_db)):
    bike = Bike(**payload.model_dump())
    db.add(bike)
    db.commit()
    db.refresh(bike)
    return bike


@app.patch("/api/bikes/{bike_id}", response_model=BikeOut)
def update_bike(bike_id: int, payload: BikeUpdate, db: Session = Depends(get_db)):
    bike = required(Bike, bike_id, db)
    apply_update(bike, payload, {"name"})
    db.commit()
    db.refresh(bike)
    return bike


@app.delete("/api/bikes/{bike_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bike(bike_id: int, db: Session = Depends(get_db)):
    db.delete(required(Bike, bike_id, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/bikes/{bike_id}/components", response_model=list[ComponentOut])
def list_components(bike_id: int, db: Session = Depends(get_db)):
    required(Bike, bike_id, db)
    return db.scalars(select(Component).where(Component.bike_id == bike_id).order_by(Component.name)).all()


@app.post("/api/bikes/{bike_id}/components", response_model=ComponentOut, status_code=status.HTTP_201_CREATED)
def create_component(bike_id: int, payload: ComponentCreate, db: Session = Depends(get_db)):
    required(Bike, bike_id, db)
    component = Component(bike_id=bike_id, **payload.model_dump())
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@app.patch("/api/components/{component_id}", response_model=ComponentOut)
def update_component(component_id: int, payload: ComponentUpdate, db: Session = Depends(get_db)):
    component = required(Component, component_id, db)
    apply_update(component, payload, {"name", "installed_km"})
    db.commit()
    db.refresh(component)
    return component


@app.delete("/api/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_component(component_id: int, db: Session = Depends(get_db)):
    db.delete(required(Component, component_id, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/bikes/{bike_id}/rides", response_model=list[BikeRideOut])
def list_bike_rides(bike_id: int, db: Session = Depends(get_db)):
    required(Bike, bike_id, db)
    return db.scalars(select(BikeRide).where(BikeRide.bike_id == bike_id).order_by(BikeRide.occurred_on.desc())).all()


@app.post("/api/bikes/{bike_id}/rides", response_model=BikeRideOut, status_code=status.HTTP_201_CREATED)
def create_bike_ride(bike_id: int, payload: BikeRideCreate, db: Session = Depends(get_db)):
    required(Bike, bike_id, db)
    ride = BikeRide(bike_id=bike_id, **payload.model_dump())
    db.add(ride)
    db.commit()
    db.refresh(ride)
    return ride


@app.get("/api/maintenance", response_model=list[MaintenanceOut])
def list_maintenance(db: Session = Depends(get_db)):
    return db.scalars(select(MaintenanceRecord).order_by(MaintenanceRecord.performed_on.desc())).all()


@app.post("/api/maintenance", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
def create_maintenance(payload: MaintenanceCreate, db: Session = Depends(get_db)):
    required(Bike, payload.bike_id, db)
    if payload.component_id is not None:
        component = required(Component, payload.component_id, db)
        if component.bike_id != payload.bike_id:
            raise HTTPException(status_code=400, detail="Le composant ne correspond pas au vélo sélectionné.")
    record = MaintenanceRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/shoes", response_model=list[ShoeOut])
def list_shoes(db: Session = Depends(get_db)):
    return db.scalars(select(Shoe).order_by(Shoe.name)).all()


@app.post("/api/shoes", response_model=ShoeOut, status_code=status.HTTP_201_CREATED)
def create_shoe(payload: ShoeCreate, db: Session = Depends(get_db)):
    shoe = Shoe(**payload.model_dump())
    db.add(shoe)
    db.commit()
    db.refresh(shoe)
    return shoe


@app.patch("/api/shoes/{shoe_id}", response_model=ShoeOut)
def update_shoe(shoe_id: int, payload: ShoeUpdate, db: Session = Depends(get_db)):
    shoe = required(Shoe, shoe_id, db)
    apply_update(shoe, payload, {"name", "shoe_type"})
    db.commit()
    db.refresh(shoe)
    return shoe


@app.delete("/api/shoes/{shoe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shoe(shoe_id: int, db: Session = Depends(get_db)):
    db.delete(required(Shoe, shoe_id, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/shoes/{shoe_id}/runs", response_model=list[ShoeRunOut])
def list_shoe_runs(shoe_id: int, db: Session = Depends(get_db)):
    required(Shoe, shoe_id, db)
    return db.scalars(select(ShoeRun).where(ShoeRun.shoe_id == shoe_id).order_by(ShoeRun.occurred_on.desc())).all()


@app.post("/api/shoes/{shoe_id}/runs", response_model=ShoeRunOut, status_code=status.HTTP_201_CREATED)
def create_shoe_run(shoe_id: int, payload: ShoeRunCreate, db: Session = Depends(get_db)):
    required(Shoe, shoe_id, db)
    run = ShoeRun(shoe_id=shoe_id, **payload.model_dump())
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@app.get("/api/shoes/{shoe_id}/assessments", response_model=list[ShoeAssessmentOut])
def list_assessments(shoe_id: int, db: Session = Depends(get_db)):
    required(Shoe, shoe_id, db)
    return db.scalars(
        select(ShoeAssessment).where(ShoeAssessment.shoe_id == shoe_id).order_by(ShoeAssessment.assessed_on.desc())
    ).all()


@app.post("/api/shoes/{shoe_id}/assessments", response_model=ShoeAssessmentOut, status_code=status.HTTP_201_CREATED)
def create_assessment(shoe_id: int, payload: ShoeAssessmentCreate, db: Session = Depends(get_db)):
    required(Shoe, shoe_id, db)
    assessment = ShoeAssessment(shoe_id=shoe_id, **payload.model_dump())
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


@app.get("/api/shoes/{shoe_id}/stats", response_model=ShoeStats)
def shoe_stats(shoe_id: int, db: Session = Depends(get_db)):
    required(Shoe, shoe_id, db)
    runs = db.scalars(select(ShoeRun).where(ShoeRun.shoe_id == shoe_id)).all()
    actual_km = sum((run.distance_km for run in runs), Decimal(0))
    road_km = sum((run.road_km for run in runs), Decimal(0))
    trail_km = sum((run.trail_km for run in runs), Decimal(0))
    weighted_km = Decimal(0)
    for run in runs:
        trail_ratio = float(run.trail_km / run.distance_km)
        terrain_multiplier = 1 + trail_ratio * (settings.wear_trail_factor - 1)
        elevation_multiplier = 1 + (run.elevation_m / float(run.distance_km)) / 100 * settings.wear_elevation_factor_per_100m
        weighted_km += run.distance_km * Decimal(str(terrain_multiplier * elevation_multiplier))
    total_surface = road_km + trail_km
    return ShoeStats(
        shoe_id=shoe_id,
        actual_km=actual_km,
        estimated_wear_km=weighted_km.quantize(Decimal("0.01")),
        run_count=len(runs),
        average_duration_minutes=sum(run.duration_minutes for run in runs) / len(runs) if runs else 0,
        total_elevation_m=sum(run.elevation_m for run in runs),
        road_percent=float(road_km / total_surface * 100) if total_surface else 0,
        trail_percent=float(trail_km / total_surface * 100) if total_surface else 0,
        wear_factors={
            "base_km": 1.0,
            "trail_factor": settings.wear_trail_factor,
            "elevation_factor_per_100m_per_km": settings.wear_elevation_factor_per_100m,
        },
    )


_static_dir = Path(__file__).with_name("static")
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")
