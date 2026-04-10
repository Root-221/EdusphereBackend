/*
  Warnings:

  - You are about to drop the column `schoolId` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `databaseUrl` to the `School` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_schoolId_fkey";

-- DropIndex
DROP INDEX "User_email_schoolId_key";

-- DropIndex
DROP INDEX "User_role_idx";

-- DropIndex
DROP INDEX "User_schoolId_idx";

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "databaseUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "schoolId";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
