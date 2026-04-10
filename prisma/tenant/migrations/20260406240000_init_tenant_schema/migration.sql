-- Remove the central-only School table from tenant databases.
DROP TABLE IF EXISTS "School";
DROP TYPE IF EXISTS "SchoolType";
DROP TYPE IF EXISTS "SchoolStatus";

-- Create shared enums used by tenant data.
DO $$
BEGIN
  CREATE TYPE "UserRole" AS ENUM (
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'TEACHER',
    'STUDENT',
    'PARENT',
    'ACCOUNTANT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "BuildingStatus" AS ENUM ('active', 'maintenance', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('active', 'maintenance', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RoomType" AS ENUM (
    'classe',
    'laboratoire',
    'informatique',
    'bibliotheque',
    'cantine',
    'bureau',
    'salle_reunion',
    'gymnase',
    'terrain',
    'sanitaire',
    'autre'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Core tenant authentication tables.
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "avatar" TEXT,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "lastLoginAt" TIMESTAMP(3),
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totpSecret" TEXT,
  "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Tenant infrastructure tables.
CREATE TABLE IF NOT EXISTS "Building" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "floorCount" INTEGER NOT NULL DEFAULT 1,
  "status" "BuildingStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Room" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "floor" INTEGER NOT NULL DEFAULT 0,
  "capacity" INTEGER NOT NULL DEFAULT 30,
  "roomType" "RoomType" NOT NULL,
  "status" "RoomStatus" NOT NULL DEFAULT 'active',
  "description" TEXT,
  "equipment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- Indices used by auth and infrastructure queries.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session"("refreshToken");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "Building_schoolId_idx" ON "Building"("schoolId");
CREATE INDEX IF NOT EXISTS "Building_status_idx" ON "Building"("status");
CREATE INDEX IF NOT EXISTS "Building_name_idx" ON "Building"("name");
CREATE INDEX IF NOT EXISTS "Room_schoolId_idx" ON "Room"("schoolId");
CREATE INDEX IF NOT EXISTS "Room_buildingId_idx" ON "Room"("buildingId");
CREATE INDEX IF NOT EXISTS "Room_status_idx" ON "Room"("status");
CREATE INDEX IF NOT EXISTS "Room_roomType_idx" ON "Room"("roomType");

-- Foreign keys only if they are missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey'
  ) THEN
    ALTER TABLE "Session"
    ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Room_buildingId_fkey'
  ) THEN
    ALTER TABLE "Room"
    ADD CONSTRAINT "Room_buildingId_fkey"
    FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
