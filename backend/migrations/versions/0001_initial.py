"""Initial GearTrack schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bikes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("brand", sa.String(80)),
        sa.Column("model", sa.String(100)),
        sa.Column("serial_number", sa.String(100), unique=True),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("current_odometer_km", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bike_id", sa.Integer(), sa.ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("category", sa.String(60)),
        sa.Column("installed_km", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("maintenance_interval_km", sa.Numeric(10, 2)),
        sa.CheckConstraint("maintenance_interval_km IS NULL OR maintenance_interval_km > 0"),
        sa.CheckConstraint("installed_km >= 0"),
    )
    op.create_table(
        "bike_rides",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bike_id", sa.Integer(), sa.ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("distance_km", sa.Numeric(10, 2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("elevation_m", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ride_type", sa.String(40), server_default="route", nullable=False),
        sa.Column("notes", sa.Text()),
        sa.CheckConstraint("distance_km > 0"),
        sa.CheckConstraint("duration_minutes > 0"),
        sa.CheckConstraint("elevation_m >= 0"),
    )
    op.create_index("ix_bike_rides_bike_date", "bike_rides", ["bike_id", "occurred_on"])
    op.create_table(
        "maintenance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bike_id", sa.Integer(), sa.ForeignKey("bikes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("component_id", sa.Integer(), sa.ForeignKey("components.id", ondelete="SET NULL")),
        sa.Column("operation", sa.String(160), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("bike_km", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_eur", sa.Numeric(10, 2)),
        sa.Column("notes", sa.Text()),
        sa.CheckConstraint("cost_eur IS NULL OR cost_eur >= 0"),
        sa.CheckConstraint("bike_km >= 0"),
    )
    op.create_index("ix_maintenance_bike_date", "maintenance_records", ["bike_id", "performed_on"])
    op.create_table(
        "shoes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("brand", sa.String(80)),
        sa.Column("model", sa.String(100)),
        sa.Column("shoe_type", sa.String(30), server_default="running", nullable=False),
        sa.Column("purchase_date", sa.Date()),
        sa.Column("notes", sa.Text()),
    )
    op.create_table(
        "shoe_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shoe_id", sa.Integer(), sa.ForeignKey("shoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("distance_km", sa.Numeric(10, 2), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("elevation_m", sa.Integer(), server_default="0", nullable=False),
        sa.Column("steps", sa.Integer()),
        sa.Column("road_km", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("trail_km", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("notes", sa.Text()),
        sa.CheckConstraint("distance_km > 0"),
        sa.CheckConstraint("duration_minutes > 0"),
        sa.CheckConstraint("elevation_m >= 0"),
        sa.CheckConstraint("road_km >= 0 AND trail_km >= 0"),
    )
    op.create_index("ix_shoe_runs_shoe_date", "shoe_runs", ["shoe_id", "occurred_on"])
    op.create_table(
        "shoe_assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("shoe_id", sa.Integer(), sa.ForeignKey("shoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessed_on", sa.Date(), nullable=False),
        sa.Column("sole_score", sa.Integer(), nullable=False),
        sa.Column("grip_score", sa.Integer(), nullable=False),
        sa.Column("cushion_score", sa.Integer(), nullable=False),
        sa.Column("comfort_score", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.CheckConstraint("sole_score BETWEEN 1 AND 5"),
        sa.CheckConstraint("grip_score BETWEEN 1 AND 5"),
        sa.CheckConstraint("cushion_score BETWEEN 1 AND 5"),
        sa.CheckConstraint("comfort_score BETWEEN 1 AND 5"),
    )
    op.create_index("ix_shoe_assessments_shoe_date", "shoe_assessments", ["shoe_id", "assessed_on"])


def downgrade():
    op.drop_index("ix_shoe_assessments_shoe_date", table_name="shoe_assessments")
    op.drop_table("shoe_assessments")
    op.drop_index("ix_shoe_runs_shoe_date", table_name="shoe_runs")
    op.drop_table("shoe_runs")
    op.drop_table("shoes")
    op.drop_index("ix_maintenance_bike_date", table_name="maintenance_records")
    op.drop_table("maintenance_records")
    op.drop_index("ix_bike_rides_bike_date", table_name="bike_rides")
    op.drop_table("bike_rides")
    op.drop_table("components")
    op.drop_table("bikes")
