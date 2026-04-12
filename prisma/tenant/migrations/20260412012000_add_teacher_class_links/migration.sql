-- Adds teacher-class assignment links for tenant users.

CREATE TABLE IF NOT EXISTS "TeacherClass" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeacherClass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherClass_teacherId_classId_key"
  ON "TeacherClass"("teacherId", "classId");

CREATE INDEX IF NOT EXISTS "TeacherClass_schoolId_idx"
  ON "TeacherClass"("schoolId");

CREATE INDEX IF NOT EXISTS "TeacherClass_teacherId_idx"
  ON "TeacherClass"("teacherId");

CREATE INDEX IF NOT EXISTS "TeacherClass_classId_idx"
  ON "TeacherClass"("classId");

ALTER TABLE "TeacherClass"
  ADD CONSTRAINT "TeacherClass_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeacherClass"
  ADD CONSTRAINT "TeacherClass_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
