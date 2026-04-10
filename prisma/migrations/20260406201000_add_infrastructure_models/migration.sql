-- CreateEnum
CREATE TYPE "BuildingStatus" AS ENUM ('active', 'maintenance', 'inactive');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('active', 'maintenance', 'inactive');

-- CreateEnum
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

-- CreateTable
CREATE TABLE "Building" (
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

-- CreateTable
CREATE TABLE "Room" (
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

-- CreateIndex
CREATE INDEX "Building_schoolId_idx" ON "Building"("schoolId");

-- CreateIndex
CREATE INDEX "Building_status_idx" ON "Building"("status");

-- CreateIndex
CREATE INDEX "Building_name_idx" ON "Building"("name");

-- CreateIndex
CREATE INDEX "Room_schoolId_idx" ON "Room"("schoolId");

-- CreateIndex
CREATE INDEX "Room_buildingId_idx" ON "Room"("buildingId");

-- CreateIndex
CREATE INDEX "Room_status_idx" ON "Room"("status");

-- CreateIndex
CREATE INDEX "Room_roomType_idx" ON "Room"("roomType");

-- AddForeignKey
ALTER TABLE "Room"
ADD CONSTRAINT "Room_buildingId_fkey"
FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
