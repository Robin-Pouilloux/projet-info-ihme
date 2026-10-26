from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BikeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    brand: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    purchase_date: date | None = None
    current_odometer_km: Decimal = Field(default=Decimal("0"), ge=0)


class BikeOut(BikeCreate, ORMModel):
    id: int
    created_at: datetime
    current_odometer_km: float


class BikeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    brand: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    purchase_date: date | None = None
    current_odometer_km: Decimal | None = Field(default=None, ge=0)


class ComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str | None = Field(default=None, max_length=60)
    installed_km: Decimal = Field(default=Decimal("0"), ge=0)
    maintenance_interval_km: Decimal | None = Field(default=None, gt=0)


class ComponentOut(ComponentCreate, ORMModel):
    id: int
    bike_id: int
    installed_km: float
    maintenance_interval_km: float | None


class ComponentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = Field(default=None, max_length=60)
    installed_km: Decimal | None = Field(default=None, ge=0)
    maintenance_interval_km: Decimal | None = Field(default=None, gt=0)


class BikeRideCreate(BaseModel):
    occurred_on: date
    distance_km: Decimal = Field(gt=0, le=1000)
    duration_minutes: int = Field(gt=0, le=1440)
    elevation_m: int = Field(default=0, ge=0, le=20000)
    ride_type: str = Field(default="route", min_length=1, max_length=40)
    notes: str | None = None


class BikeRideOut(BikeRideCreate, ORMModel):
    id: int
    bike_id: int
    distance_km: float


class MaintenanceCreate(BaseModel):
    bike_id: int
    component_id: int | None = None
    operation: str = Field(min_length=1, max_length=160)
    performed_on: date
    bike_km: Decimal = Field(ge=0)
    cost_eur: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None


class MaintenanceOut(MaintenanceCreate, ORMModel):
    id: int
    bike_km: float
    cost_eur: float | None


class ShoeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    brand: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=100)
    shoe_type: str = Field(default="running", min_length=1, max_length=30)
    purchase_date: date | None = None
    notes: str | None = None


class ShoeOut(ShoeCreate, ORMModel):
    id: int


class ShoeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    brand: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=100)
    shoe_type: str | None = Field(default=None, min_length=1, max_length=30)
    purchase_date: date | None = None
    notes: str | None = None


class ShoeRunCreate(BaseModel):
    occurred_on: date
    distance_km: Decimal = Field(gt=0, le=500)
    duration_minutes: int = Field(gt=0, le=1440)
    elevation_m: int = Field(default=0, ge=0, le=20000)
    steps: int | None = Field(default=None, gt=0)
    road_km: Decimal = Field(default=Decimal("0"), ge=0)
    trail_km: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None

    @model_validator(mode="after")
    def surfaces_match_distance(self):
        if abs(self.road_km + self.trail_km - self.distance_km) > Decimal("0.02"):
            raise ValueError("La somme route + trail doit correspondre à la distance (± 0,02 km).")
        return self


class ShoeRunOut(ShoeRunCreate, ORMModel):
    id: int
    shoe_id: int
    distance_km: float
    road_km: float
    trail_km: float


class ShoeAssessmentCreate(BaseModel):
    assessed_on: date
    sole_score: int = Field(ge=1, le=5)
    grip_score: int = Field(ge=1, le=5)
    cushion_score: int = Field(ge=1, le=5)
    comfort_score: int = Field(ge=1, le=5)
    notes: str | None = None


class ShoeAssessmentOut(ShoeAssessmentCreate, ORMModel):
    id: int
    shoe_id: int


class ShoeStats(ORMModel):
    shoe_id: int
    actual_km: float
    estimated_wear_km: float
    run_count: int
    average_duration_minutes: float
    total_elevation_m: int
    road_percent: float
    trail_percent: float
    wear_factors: dict[str, float]


class Dashboard(ORMModel):
    bike_count: int
    shoe_count: int
    total_km: float
    bike_km: float
    running_km: float
    activity_count: int
    upcoming_maintenance: list[dict]
    recent_activities: list[dict]
