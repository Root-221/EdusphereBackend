-- Remove tenant-only infrastructure tables from the central database.
DROP TABLE IF EXISTS "Room";
DROP TABLE IF EXISTS "Building";
DROP TYPE IF EXISTS "RoomType";
DROP TYPE IF EXISTS "RoomStatus";
DROP TYPE IF EXISTS "BuildingStatus";
