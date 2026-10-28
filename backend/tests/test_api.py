from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        with TestingSession() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_dashboard_is_empty_without_seed_data(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    assert response.json() == {
        "bike_count": 0,
        "shoe_count": 0,
        "total_km": 0,
        "bike_km": 0,
        "running_km": 0,
        "activity_count": 0,
        "upcoming_maintenance": [],
        "recent_activities": [],
    }


def test_openapi_documents_the_rest_api(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/dashboard" in response.json()["paths"]
    assert "/api/shoes/{shoe_id}/stats" in response.json()["paths"]
    assert "/api/coros/auth/status" in response.json()["paths"]


def test_health_checks_database_connection(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_reports_database_unavailable_without_leaking_connection_details(client):
    class UnavailableDatabase:
        def execute(self, statement):
            raise OperationalError(statement, {}, Exception("sensitive connection detail"))

    def override_get_db():
        yield UnavailableDatabase()

    app.dependency_overrides[get_db] = override_get_db
    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"detail": {"status": "unavailable"}}
    assert "sensitive connection detail" not in response.text


def test_bike_maintenance_due_and_component_ownership(client):
    bike = client.post("/api/bikes", json={"name": "Vélo de route"}).json()
    component = client.post(
        f"/api/bikes/{bike['id']}/components",
        json={"name": "Chaîne", "installed_km": 0, "maintenance_interval_km": 500},
    ).json()
    other_bike = client.post("/api/bikes", json={"name": "VTT"}).json()

    ride = client.post(
        f"/api/bikes/{bike['id']}/rides",
        json={"occurred_on": str(date.today()), "distance_km": 520, "duration_minutes": 100, "elevation_m": 500},
    )
    assert ride.status_code == 201
    invalid_record = client.post(
        "/api/maintenance",
        json={
            "bike_id": other_bike["id"],
            "component_id": component["id"],
            "operation": "Lubrification",
            "performed_on": str(date.today()),
            "bike_km": 520,
        },
    )
    assert invalid_record.status_code == 400

    dashboard = client.get("/api/dashboard").json()
    assert dashboard["bike_km"] == 520
    assert dashboard["upcoming_maintenance"][0]["overdue"] is True
    maintenance = client.post(
        "/api/maintenance",
        json={
            "bike_id": bike["id"],
            "component_id": component["id"],
            "operation": "Lubrification",
            "performed_on": str(date.today()),
            "bike_km": 520,
            "cost_eur": "8.50",
        },
    )
    assert maintenance.status_code == 201
    refreshed = client.get("/api/dashboard").json()["upcoming_maintenance"][0]
    assert refreshed["overdue"] is False
    assert refreshed["due_at_km"] == 1020


def test_shoe_statistics_use_transparent_distance_based_wear_index(client):
    shoe = client.post("/api/shoes", json={"name": "Trail test", "shoe_type": "trail"}).json()
    run = client.post(
        f"/api/shoes/{shoe['id']}/runs",
        json={
            "occurred_on": str(date.today()),
            "distance_km": "10",
            "duration_minutes": 60,
            "elevation_m": 500,
            "steps": 12000,
            "road_km": "2",
            "trail_km": "8",
        },
    )
    assert run.status_code == 201
    stats = client.get(f"/api/shoes/{shoe['id']}/stats").json()
    assert stats["actual_km"] == 10
    assert stats["estimated_wear_km"] > stats["actual_km"]
    assert stats["run_count"] == 1
    assert stats["road_percent"] == pytest.approx(20)
    assert stats["trail_percent"] == pytest.approx(80)
    assert stats["wear_factors"]["trail_factor"] == 1.25


def test_shoe_run_rejects_surface_distance_mismatch(client):
    shoe = client.post("/api/shoes", json={"name": "Paire"}).json()
    response = client.post(
        f"/api/shoes/{shoe['id']}/runs",
        json={
            "occurred_on": str(date.today()),
            "distance_km": "10",
            "duration_minutes": 60,
            "road_km": "3",
            "trail_km": "6",
        },
    )
    assert response.status_code == 422


def test_shoe_assessment_validation_and_crud(client):
    shoe = client.post("/api/shoes", json={"name": "Quotidiennes"}).json()
    invalid = client.post(
        f"/api/shoes/{shoe['id']}/assessments",
        json={
            "assessed_on": str(date.today()),
            "sole_score": 6,
            "grip_score": 4,
            "cushion_score": 3,
            "comfort_score": 4,
        },
    )
    assert invalid.status_code == 422
    update = client.patch(f"/api/shoes/{shoe['id']}", json={"name": "Quotidiennes v2"})
    assert update.status_code == 200
    assert update.json()["name"] == "Quotidiennes v2"
    valid = client.post(
        f"/api/shoes/{shoe['id']}/assessments",
        json={
            "assessed_on": str(date.today()),
            "sole_score": 4,
            "grip_score": 3,
            "cushion_score": 4,
            "comfort_score": 5,
        },
    )
    assert valid.status_code == 201
    assert client.get(f"/api/shoes/{shoe['id']}/assessments").json()[0]["comfort_score"] == 5


def test_delete_bike_cascades_to_rides(client):
    bike = client.post("/api/bikes", json={"name": "Vélo à supprimer"}).json()
    client.post(
        f"/api/bikes/{bike['id']}/rides",
        json={"occurred_on": str(date.today()), "distance_km": 20, "duration_minutes": 60},
    )
    assert client.delete(f"/api/bikes/{bike['id']}").status_code == 204
    assert client.get("/api/dashboard").json()["bike_km"] == 0
