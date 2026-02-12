-- Row Level Security (RLS) Policies for TurfRun Game

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on zones table
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Policy: Users can view all other users (for leaderboards, zone ownership display)
CREATE POLICY "Users are viewable by everyone"
    ON users FOR SELECT
    USING (true);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON users FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Users cannot delete their own profile (admin only)
CREATE POLICY "Users cannot delete profiles"
    ON users FOR DELETE
    USING (false);

-- ============================================
-- ZONES TABLE POLICIES
-- ============================================

-- Policy: Zones are viewable by everyone (for map display)
CREATE POLICY "Zones are viewable by everyone"
    ON zones FOR SELECT
    USING (true);

-- Policy: Authenticated users can create zones (when capturing)
CREATE POLICY "Authenticated users can create zones"
    ON zones FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Zone owners can update their zones
-- Also allow updates during attacks (defense_score changes, status changes)
CREATE POLICY "Users can update zones they own or are attacking"
    ON zones FOR UPDATE
    TO authenticated
    USING (
        owner_id = auth.uid() OR
        status IN ('under_attack', 'war')
    )
    WITH CHECK (
        owner_id = auth.uid() OR
        status IN ('under_attack', 'war')
    );

-- Policy: Zone owners can delete their zones (abandon territory)
CREATE POLICY "Zone owners can delete their zones"
    ON zones FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- ============================================
-- ADDITIONAL SECURITY FUNCTIONS
-- ============================================

-- Helper function to check if a user owns a zone
CREATE OR REPLACE FUNCTION user_owns_zone(zone_id TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM zones
        WHERE id = zone_id AND owner_id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if a zone is attackable by a user
CREATE OR REPLACE FUNCTION zone_is_attackable(zone_id TEXT, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    zone_owner UUID;
BEGIN
    SELECT owner_id INTO zone_owner FROM zones WHERE id = zone_id;
    RETURN zone_owner IS NULL OR zone_owner != user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
