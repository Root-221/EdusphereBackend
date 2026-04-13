-- Adds annual timetables with recurring entries.

CREATE TABLE IF NOT EXISTS "AnnualTimetable" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnnualTimetable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AnnualTimetableEntry" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "annualTimetableId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "roomId" TEXT,
  "semesterId" TEXT,
  "dayOfWeek" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "dateStart" TIMESTAMP(3) NOT NULL,
  "dateEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnnualTimetableEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualTimetable_schoolId_academicYearId_classId_key"
  ON "AnnualTimetable"("schoolId", "academicYearId", "classId");

CREATE INDEX IF NOT EXISTS "AnnualTimetable_schoolId_idx" ON "AnnualTimetable"("schoolId");
CREATE INDEX IF NOT EXISTS "AnnualTimetable_academicYearId_idx" ON "AnnualTimetable"("academicYearId");
CREATE INDEX IF NOT EXISTS "AnnualTimetable_classId_idx" ON "AnnualTimetable"("classId");
CREATE INDEX IF NOT EXISTS "AnnualTimetable_status_idx" ON "AnnualTimetable"("status");

CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_schoolId_idx" ON "AnnualTimetableEntry"("schoolId");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_annualTimetableId_idx" ON "AnnualTimetableEntry"("annualTimetableId");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_classId_idx" ON "AnnualTimetableEntry"("classId");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_teacherId_idx" ON "AnnualTimetableEntry"("teacherId");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_roomId_idx" ON "AnnualTimetableEntry"("roomId");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_dayOfWeek_idx" ON "AnnualTimetableEntry"("dayOfWeek");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_dateStart_idx" ON "AnnualTimetableEntry"("dateStart");
CREATE INDEX IF NOT EXISTS "AnnualTimetableEntry_dateEnd_idx" ON "AnnualTimetableEntry"("dateEnd");

ALTER TABLE "AnnualTimetable"
  ADD CONSTRAINT "AnnualTimetable_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetable"
  ADD CONSTRAINT "AnnualTimetable_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_annualTimetableId_fkey"
  FOREIGN KEY ("annualTimetableId") REFERENCES "AnnualTimetable"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnnualTimetableEntry"
  ADD CONSTRAINT "AnnualTimetableEntry_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "Semester"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
