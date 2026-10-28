CREATE TABLE IF NOT EXISTS bikes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    brand VARCHAR(80),
    model VARCHAR(100),
    serial_number VARCHAR(100) UNIQUE,
    purchase_date DATE,
    current_odometer_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS components (
    id SERIAL PRIMARY KEY,
    bike_id INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(60),
    installed_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    maintenance_interval_km NUMERIC(10, 2),
    CHECK (maintenance_interval_km IS NULL OR maintenance_interval_km > 0),
    CHECK (installed_km >= 0)
);

CREATE TABLE IF NOT EXISTS bike_rides (
    id SERIAL PRIMARY KEY,
    bike_id INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    occurred_on DATE NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL CHECK (distance_km > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    elevation_m INTEGER NOT NULL DEFAULT 0 CHECK (elevation_m >= 0),
    ride_type VARCHAR(40) NOT NULL DEFAULT 'route',
    notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_bike_rides_bike_date ON bike_rides (bike_id, occurred_on);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id SERIAL PRIMARY KEY,
    bike_id INTEGER NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    component_id INTEGER REFERENCES components(id) ON DELETE SET NULL,
    operation VARCHAR(160) NOT NULL,
    performed_on DATE NOT NULL,
    bike_km NUMERIC(10, 2) NOT NULL CHECK (bike_km >= 0),
    cost_eur NUMERIC(10, 2) CHECK (cost_eur IS NULL OR cost_eur >= 0),
    notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_maintenance_bike_date ON maintenance_records (bike_id, performed_on);

CREATE TABLE IF NOT EXISTS shoes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    brand VARCHAR(80),
    model VARCHAR(100),
    shoe_type VARCHAR(30) NOT NULL DEFAULT 'running',
    purchase_date DATE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS shoe_runs (
    id SERIAL PRIMARY KEY,
    shoe_id INTEGER NOT NULL REFERENCES shoes(id) ON DELETE CASCADE,
    occurred_on DATE NOT NULL,
    distance_km NUMERIC(10, 2) NOT NULL CHECK (distance_km > 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    elevation_m INTEGER NOT NULL DEFAULT 0 CHECK (elevation_m >= 0),
    steps INTEGER,
    road_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    trail_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    CHECK (road_km >= 0 AND trail_km >= 0)
);
CREATE INDEX IF NOT EXISTS ix_shoe_runs_shoe_date ON shoe_runs (shoe_id, occurred_on);

CREATE TABLE IF NOT EXISTS shoe_assessments (
    id SERIAL PRIMARY KEY,
    shoe_id INTEGER NOT NULL REFERENCES shoes(id) ON DELETE CASCADE,
    assessed_on DATE NOT NULL,
    sole_score INTEGER NOT NULL CHECK (sole_score BETWEEN 1 AND 5),
    grip_score INTEGER NOT NULL CHECK (grip_score BETWEEN 1 AND 5),
    cushion_score INTEGER NOT NULL CHECK (cushion_score BETWEEN 1 AND 5),
    comfort_score INTEGER NOT NULL CHECK (comfort_score BETWEEN 1 AND 5),
    notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_shoe_assessments_shoe_date ON shoe_assessments (shoe_id, assessed_on);

CREATE TABLE IF NOT EXISTS geartrack_schema_migrations (
    version VARCHAR(100) PRIMARY KEY
);
