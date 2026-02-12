-- TurfRun Game Database Schema
-- PostgreSQL with PostGIS extension

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#3b82f6',
    total_ep INTEGER NOT NULL DEFAULT 0,
    respect_level INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_color_hex CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT positive_ep CHECK (total_ep >= 0),
    CONSTRAINT positive_respect CHECK (respect_level >= 1)
);

-- Zone status enum
CREATE TYPE zone_status AS ENUM ('neutral', 'safe', 'under_attack', 'war');

-- Zones table (only stores captured/contested zones, not empty zones)
CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY, -- grid_id format: "lat_lon" e.g., "12345_67890"
    geom GEOMETRY(POLYGON, 4326) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    defense_score INTEGER NOT NULL DEFAULT 0,
    status zone_status NOT NULL DEFAULT 'neutral',
    captured_at TIMESTAMPTZ,
    last_attack_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_defense_score CHECK (defense_score >= 0 AND defense_score <= 100)
);

-- Create GiST index on zones.geom for spatial queries
CREATE INDEX IF NOT EXISTS idx_zones_geom ON zones USING GIST(geom);

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_zones_owner ON zones(owner_id);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);

-- Helper function: Generate grid_id from latitude and longitude
-- Grid size: 50m (~0.00045 degrees)
CREATE OR REPLACE FUNCTION generate_grid_id(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS TEXT AS $$
BEGIN
    RETURN FLOOR(lat / 0.00045)::TEXT || '_' || FLOOR(lon / 0.00045)::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function: Generate polygon geometry for a grid cell from lat/lon
-- Snaps to grid and creates a 50m x 50m polygon
CREATE OR REPLACE FUNCTION generate_zone_geom(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS GEOMETRY AS $$
DECLARE
    grid_lat DOUBLE PRECISION;
    grid_lon DOUBLE PRECISION;
    grid_size DOUBLE PRECISION := 0.00045;
BEGIN
    -- Snap to grid
    grid_lat := FLOOR(lat / grid_size) * grid_size;
    grid_lon := FLOOR(lon / grid_size) * grid_size;
    
    -- Create polygon using ST_MakeEnvelope
    RETURN ST_MakeEnvelope(
        grid_lon,
        grid_lat,
        grid_lon + grid_size,
        grid_lat + grid_size,
        4326
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function: Get or create zone by coordinates
-- Returns the grid_id for the given coordinates
CREATE OR REPLACE FUNCTION get_zone_id_at_location(lat DOUBLE PRECISION, lon DOUBLE PRECISION)
RETURNS TEXT AS $$
BEGIN
    RETURN generate_grid_id(lat, lon);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_zones_updated_at
    BEFORE UPDATE ON zones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
