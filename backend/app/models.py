from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Bike(Base):
    __tablename__ = "bikes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100), unique=True)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    current_odometer_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    components: Mapped[list["Component"]] = relationship(back_populates="bike", cascade="all, delete-orphan")
    rides: Mapped[list["BikeRide"]] = relationship(back_populates="bike", cascade="all, delete-orphan")


class Component(Base):
    __tablename__ = "components"
    __table_args__ = (
        CheckConstraint("maintenance_interval_km IS NULL OR maintenance_interval_km > 0"),
        CheckConstraint("installed_km >= 0"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bike_id: Mapped[int] = mapped_column(ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str | None] = mapped_column(String(60))
    installed_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    maintenance_interval_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    bike: Mapped[Bike] = relationship(back_populates="components")
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="component")


class BikeRide(Base):
    __tablename__ = "bike_rides"
    __table_args__ = (CheckConstraint("distance_km > 0"), CheckConstraint("duration_minutes > 0"), CheckConstraint("elevation_m >= 0"))

    id: Mapped[int] = mapped_column(primary_key=True)
    bike_id: Mapped[int] = mapped_column(ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    distance_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(nullable=False)
    elevation_m: Mapped[int] = mapped_column(default=0, nullable=False)
    ride_type: Mapped[str] = mapped_column(String(40), default="route", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    bike: Mapped[Bike] = relationship(back_populates="rides")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"
    __table_args__ = (CheckConstraint("cost_eur IS NULL OR cost_eur >= 0"), CheckConstraint("bike_km >= 0"))

    id: Mapped[int] = mapped_column(primary_key=True)
    bike_id: Mapped[int] = mapped_column(ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False)
    component_id: Mapped[int | None] = mapped_column(ForeignKey("components.id", ondelete="SET NULL"))
    operation: Mapped[str] = mapped_column(String(160), nullable=False)
    performed_on: Mapped[date] = mapped_column(Date, nullable=False)
    bike_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost_eur: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    bike: Mapped[Bike] = relationship()
    component: Mapped[Component | None] = relationship(back_populates="maintenance_records")


class Shoe(Base):
    __tablename__ = "shoes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(80))
    model: Mapped[str | None] = mapped_column(String(100))
    shoe_type: Mapped[str] = mapped_column(String(30), default="running", nullable=False)
    purchase_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    runs: Mapped[list["ShoeRun"]] = relationship(back_populates="shoe", cascade="all, delete-orphan")
    assessments: Mapped[list["ShoeAssessment"]] = relationship(back_populates="shoe", cascade="all, delete-orphan")


class ShoeRun(Base):
    __tablename__ = "shoe_runs"
    __table_args__ = (
        CheckConstraint("distance_km > 0"),
        CheckConstraint("duration_minutes > 0"),
        CheckConstraint("elevation_m >= 0"),
        CheckConstraint("road_km >= 0 AND trail_km >= 0"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shoe_id: Mapped[int] = mapped_column(ForeignKey("shoes.id", ondelete="CASCADE"), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    distance_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(nullable=False)
    elevation_m: Mapped[int] = mapped_column(default=0, nullable=False)
    steps: Mapped[int | None] = mapped_column()
    road_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    trail_km: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    shoe: Mapped[Shoe] = relationship(back_populates="runs")


class ShoeAssessment(Base):
    __tablename__ = "shoe_assessments"
    __table_args__ = tuple(
        CheckConstraint(f"{column} BETWEEN 1 AND 5")
        for column in ("sole_score", "grip_score", "cushion_score", "comfort_score")
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shoe_id: Mapped[int] = mapped_column(ForeignKey("shoes.id", ondelete="CASCADE"), nullable=False)
    assessed_on: Mapped[date] = mapped_column(Date, nullable=False)
    sole_score: Mapped[int] = mapped_column(nullable=False)
    grip_score: Mapped[int] = mapped_column(nullable=False)
    cushion_score: Mapped[int] = mapped_column(nullable=False)
    comfort_score: Mapped[int] = mapped_column(nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    shoe: Mapped[Shoe] = relationship(back_populates="assessments")
